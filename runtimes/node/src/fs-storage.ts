import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import type { StorageAdapter, StoredAsset } from "@qreminder/server";

export function createFsStorage(baseDir: string): StorageAdapter {
  return {
    async put({ body, mimeType, originalName }) {
      await mkdir(baseDir, { recursive: true });
      const ext = extname(originalName) || mimeExtension(mimeType);
      const key = `${randomUUID()}${ext}`;
      const buffer = body instanceof Uint8Array ? body : new Uint8Array(body);
      await writeFile(join(baseDir, key), buffer);
      const asset: StoredAsset = {
        key,
        mimeType,
        sizeBytes: buffer.byteLength,
        originalName,
      };
      return asset;
    },
    async get(key) {
      try {
        const data = await readFile(join(baseDir, key));
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
        const ext = extname(key);
        return { body: stream, mimeType: extToMime(ext) };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(join(baseDir, key), { force: true });
    },
  };
}

function mimeExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  };
  return map[mime] ?? "";
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}
