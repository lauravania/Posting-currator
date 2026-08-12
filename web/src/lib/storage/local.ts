import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import type { StorageAdapter } from "./types";

// Dev/demo storage: writes into public/uploads so Next.js can serve files
// directly. Swap STORAGE_DRIVER=s3 (see s3.ts) to point at S3 or
// Supabase Storage (S3-compatible) in production — nothing above this
// interface needs to change.
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer): Promise<string> {
    const fullPath = path.join(UPLOAD_ROOT, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return key;
  }

  async resolveReadPath(key: string): Promise<string> {
    return path.join(UPLOAD_ROOT, key);
  }

  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(path.join(UPLOAD_ROOT, key));
    } catch {
      // already gone — fine.
    }
  }
}
