import type { BackupStore } from "@qreminder/server";

/**
 * R2 适配 BackupStore：把跨用户的自动备份写到固定 prefix 下，
 * 并支持列表 + 删除，用于定期保留滚动。
 */
export function createR2BackupStore(bucket: R2Bucket): BackupStore {
  return {
    async putBackup(key, body) {
      const buffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(buffer).set(body);
      await bucket.put(key, buffer, {
        httpMetadata: { contentType: "application/zip" },
      });
    },
    async listBackupKeys(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const opts: { prefix: string; limit: number; cursor?: string } = {
          prefix,
          limit: 1000,
        };
        if (cursor) opts.cursor = cursor;
        const listed = await bucket.list(opts);
        for (const obj of listed.objects) out.push(obj.key);
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
      return out;
    },
    async deleteBackup(key) {
      await bucket.delete(key);
    },
  };
}
