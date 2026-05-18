export interface StoredAsset {
  key: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

export interface StorageAdapter {
  put(input: {
    body: ArrayBuffer | Uint8Array;
    mimeType: string;
    originalName: string;
  }): Promise<StoredAsset>;
  get(key: string): Promise<{ body: ReadableStream; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}
