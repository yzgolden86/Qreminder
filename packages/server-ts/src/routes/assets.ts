import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { assets } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

const allowedMimeTypes = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/gif",
]);
const allowedKinds = new Set(["logo", "icon"]);
const maxAssetBytes = 1024 * 1024;
const fetchTimeoutMs = 10_000;

export const assetsRouter = new Hono<AppEnv>();

assetsRouter.post("/", requireSession, async (c) => {
  const db = c.get("deps").db;
  const storage = c.get("deps").storage;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const form = await c.req.formData();
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!allowedKinds.has(kind)) {
    return c.json({ error: "invalid_kind" }, 400);
  }
  if (
    !file ||
    typeof file === "string" ||
    typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    return c.json({ error: "missing_file" }, 400);
  }
  const blob = file as Blob & { name?: string };
  if (!allowedMimeTypes.has(blob.type)) {
    return c.json({ error: "unsupported_mime_type" }, 415);
  }
  if (blob.size > maxAssetBytes) {
    return c.json({ error: "file_too_large" }, 413);
  }

  const buffer = new Uint8Array(await blob.arrayBuffer());
  const stored = await storage.put({
    body: buffer,
    mimeType: blob.type,
    originalName: blob.name ?? "upload",
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(assets).values({
    id,
    user: userId,
    workspaceId,
    kind: kind as "logo" | "icon",
    file: stored.key,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    originalName: stored.originalName,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    id,
    kind,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    originalName: stored.originalName,
  }, 201);
});

assetsRouter.get("/:id", requireSession, async (c) => {
  const db = c.get("deps").db;
  const storage = c.get("deps").storage;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const id = c.req.param("id");

  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.user, userId), eq(assets.workspaceId, workspaceId)));
  if (!row) return c.json({ error: "not_found" }, 404);

  const obj = await storage.get(row.file);
  if (!obj) return c.json({ error: "asset_blob_missing" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": obj.mimeType,
      "cache-control": "private, max-age=300",
    },
  });
});

// GET /assets — list current user's assets (newest first, optionally filtered by kind).
// Used by the "logo library" UI so users can re-pick a previously uploaded/fetched logo
// instead of re-uploading the same file.
assetsRouter.get("/", requireSession, async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const kind = c.req.query("kind");
  if (kind && !allowedKinds.has(kind)) {
    return c.json({ error: "invalid_kind" }, 400);
  }

  const rows = await db
    .select()
    .from(assets)
    .where(
      kind
        ? and(eq(assets.user, userId), eq(assets.workspaceId, workspaceId), eq(assets.kind, kind as "logo" | "icon"))
        : and(eq(assets.user, userId), eq(assets.workspaceId, workspaceId)),
    )
    .orderBy(desc(assets.createdAt))
    .limit(200);

  return c.json({
    assets: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      originalName: row.originalName,
      createdAt: row.createdAt,
    })),
  });
});

// DELETE /assets/:id — remove a logo from the library + R2.
assetsRouter.delete("/:id", requireSession, async (c) => {
  const db = c.get("deps").db;
  const storage = c.get("deps").storage;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const id = c.req.param("id");

  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.user, userId), eq(assets.workspaceId, workspaceId)));
  if (!row) return c.json({ error: "not_found" }, 404);

  await storage.delete(row.file);
  await db.delete(assets).where(eq(assets.id, id));
  return c.json({ ok: true });
});

// POST /assets/fetch-from-url — server-side fetch + store. Used to grab a logo
// from a subscription's website (favicon, og:image, or a direct image URL).
// Why server-side: storing in R2 means the logo survives even if the source goes
// away later, and clients don't have to deal with CORS for arbitrary domains.
assetsRouter.post("/fetch-from-url", requireSession, async (c) => {
  const db = c.get("deps").db;
  const storage = c.get("deps").storage;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const body = await c.req.json().catch(() => null) as { url?: string; kind?: string } | null;
  if (!body || typeof body.url !== "string") {
    return c.json({ error: "validation_error" }, 400);
  }
  const kind = body.kind && allowedKinds.has(body.kind) ? body.kind : "logo";

  // Resolve to a list of candidate URLs to try.
  let candidates: string[];
  try {
    candidates = buildFetchCandidates(body.url);
  } catch {
    return c.json({ error: "invalid_url" }, 400);
  }
  if (candidates.length === 0) {
    return c.json({ error: "invalid_url" }, 400);
  }

  let fetched: { bytes: Uint8Array; mimeType: string; sourceUrl: string } | null = null;
  for (const candidate of candidates) {
    try {
      const result = await fetchImage(candidate);
      if (result) {
        fetched = { ...result, sourceUrl: candidate };
        break;
      }
    } catch {
      // Try the next candidate.
    }
  }
  if (!fetched) {
    return c.json({ error: "fetch_failed", message: "Could not fetch a usable image" }, 502);
  }

  const stored = await storage.put({
    body: fetched.bytes,
    mimeType: fetched.mimeType,
    originalName: fetched.sourceUrl.split("/").pop() || "fetched",
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(assets).values({
    id,
    user: userId,
    workspaceId,
    kind: kind as "logo" | "icon",
    file: stored.key,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    originalName: stored.originalName,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(
    {
      id,
      kind,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      originalName: stored.originalName,
      sourceUrl: fetched.sourceUrl,
    },
    201,
  );
});

/**
 * Turn the user's input into an ordered list of URLs to try.
 *
 * - Direct image URL → use as-is.
 * - Website URL → try several common favicon paths + a third-party favicon service
 *   as a last-resort fallback.
 */
function buildFetchCandidates(input: string): string[] {
  let url: URL;
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(input);
  if (!hasProtocol) {
    // Bare hostname like "netflix.com" — assume https.
    url = new URL(`https://${input}`);
  } else {
    url = new URL(input);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }

  // Block private/loopback hosts to prevent SSRF from a self-hosted Worker
  // toward its own private network. Cloudflare Workers don't actually have
  // access to RFC1918 ranges, but adding a defensive check is cheap.
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host === "0.0.0.0"
    || host.startsWith("127.")
    || host.startsWith("10.")
    || host.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("private_host_blocked");
  }

  const isLikelyImage = /\.(svg|png|jpe?g|webp|gif|ico)(\?|$)/i.test(url.pathname);
  if (isLikelyImage) {
    return [url.toString()];
  }

  const origin = `${url.protocol}//${url.hostname}`;
  return [
    `${origin}/favicon.svg`,
    `${origin}/apple-touch-icon.png`,
    `${origin}/favicon-192.png`,
    `${origin}/favicon-32x32.png`,
    `${origin}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`,
  ];
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "image/*" },
    });
    if (!res.ok) return null;
    let contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    // Some servers return application/octet-stream for .ico; tolerate it if the URL ends in .ico.
    if (!allowedMimeTypes.has(contentType)) {
      if (/\.ico(\?|$)/i.test(url)) contentType = "image/x-icon";
      else if (/\.svg(\?|$)/i.test(url)) contentType = "image/svg+xml";
      else if (/\.png(\?|$)/i.test(url)) contentType = "image/png";
      else return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    if (arrayBuffer.byteLength > maxAssetBytes) return null;
    return { bytes: new Uint8Array(arrayBuffer), mimeType: contentType };
  } finally {
    clearTimeout(timer);
  }
}

// Exposed for unit tests.
export const __testing__ = { buildFetchCandidates };
