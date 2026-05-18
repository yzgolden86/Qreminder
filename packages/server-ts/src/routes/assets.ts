import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { assets } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

const allowedMimeTypes = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const allowedKinds = new Set(["logo", "icon"]);
const maxAssetBytes = 1024 * 1024;

export const assetsRouter = new Hono<AppEnv>();

assetsRouter.post("/", requireSession, async (c) => {
  const db = c.get("deps").db;
  const storage = c.get("deps").storage;
  const userId = c.get("user").id;

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
  const id = c.req.param("id");

  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.user, userId)));
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
