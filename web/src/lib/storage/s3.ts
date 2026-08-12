import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { StorageAdapter } from "./types";

// Production storage: any S3-compatible endpoint, including Supabase
// Storage. Activated by STORAGE_DRIVER=s3 with S3_* env vars set.
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3.");
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType })
    );
    return key;
  }

  async resolveReadPath(key: string): Promise<string> {
    // Analysis code (Sharp) needs a local file path — download to a temp
    // file when running against remote object storage.
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(cmd);
    const bytes = await res.Body?.transformToByteArray();
    const dir = await mkdtemp(path.join(tmpdir(), "wmi-"));
    const filePath = path.join(dir, path.basename(key));
    await writeFile(filePath, Buffer.from(bytes ?? []));
    return filePath;
  }

  publicUrl(key: string): string {
    // Assumes a public bucket/CDN. For private buckets, prefer generating
    // a signed URL per-request via getSignedReadUrl() below instead.
    const base = process.env.S3_PUBLIC_BASE_URL;
    return base ? `${base}/${key}` : key;
  }

  async getSignedReadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
