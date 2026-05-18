import type { StorageAdapter, StoredAsset } from "@qreminder/server";

export function createR2Storage(bucket: R2Bucket): StorageAdapter {
  return {
    async put({ body, mimeType, originalName }) {
      const key = `${crypto.randomUUID()}`;
      const buffer = body instanceof Uint8Array ? body : new Uint8Array(body);
      await bucket.put(key, buffer, {
        httpMetadata: { contentType: mimeType },
        customMetadata: { originalName },
      });
      const asset: StoredAsset = {
        key,
        mimeType,
        sizeBytes: buffer.byteLength,
        originalName,
      };
      return asset;
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        mimeType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
