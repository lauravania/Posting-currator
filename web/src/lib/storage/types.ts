export interface StorageAdapter {
  /** Persist a file, returning the storage key it was saved under. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Absolute filesystem path or signed URL usable to read the file back. */
  resolveReadPath(key: string): Promise<string>;
  /** Public (or app-servable) URL for displaying the file in the browser. */
  publicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
