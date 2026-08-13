import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { randomId, sanitizeFilename } from "@/lib/id";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/validation";
import { analyzeAndSavePhoto } from "@/lib/curation";
import { getValidAccessToken, getCloudAdapter, type CloudImage } from "@/lib/cloud";
import type { ImportSource } from "@prisma/client";

/**
 * Shared photo-ingestion step: validate bytes, thumbnail, store, create the
 * Photo row. Used by the device-upload route and by cloud imports below —
 * one code path for "how a photo enters the library" regardless of where
 * its bytes came from, so device/Drive/Dropbox photos are indistinguishable
 * once imported.
 */
export async function importPhotoBuffer(params: {
  weddingId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  importSource: ImportSource;
  importJobId?: string;
}) {
  if (!ALLOWED_IMAGE_TYPES.includes(params.mimeType)) {
    throw new Error(`Unsupported file type: ${params.mimeType || "unknown"}. Use JPG, PNG, or WEBP.`);
  }
  if (params.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB): ${params.filename}`);
  }

  let metadata;
  try {
    metadata = await sharp(params.buffer).metadata();
  } catch {
    throw new Error(`"${params.filename}" is not a readable image.`);
  }
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions for "${params.filename}".`);
  }

  const storage = getStorageAdapter();
  const id = randomId();
  const safeName = sanitizeFilename(params.filename || "photo.jpg");
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  const originalKey = `weddings/${params.weddingId}/photos/${id}.${ext}`;
  const thumbKey = `weddings/${params.weddingId}/thumbs/${id}.jpg`;

  const thumbBuffer = await sharp(params.buffer).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();

  await storage.put(originalKey, params.buffer, params.mimeType);
  await storage.put(thumbKey, thumbBuffer, "image/jpeg");

  return prisma.photo.create({
    data: {
      weddingId: params.weddingId,
      storageKey: originalKey,
      thumbnailKey: thumbKey,
      originalFilename: safeName,
      mimeType: params.mimeType,
      fileSizeBytes: params.buffer.byteLength,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height,
      importSource: params.importSource,
      importJobId: params.importJobId,
    },
  });
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/**
 * Live progress for a job — deliberately computed from the Photo rows
 * themselves (count imported, count analyzed) rather than a manually
 * incremented counter, so concurrent imports can never desync the number
 * shown from what's actually in the database.
 */
export async function getImportJobProgress(jobId: string) {
  const [job, importedFiles, analyzedFiles] = await Promise.all([
    prisma.photoImportJob.findUnique({ where: { id: jobId } }),
    prisma.photo.count({ where: { importJobId: jobId } }),
    prisma.photo.count({ where: { importJobId: jobId, analysis: { isNot: null } } }),
  ]);
  if (!job) return null;
  return { ...job, importedFiles, analyzedFiles };
}

/**
 * Runs a cloud import job end-to-end: list the folder's images, download +
 * ingest each one, then automatically run AI curation on everything just
 * imported — no second manual "Run AI curation" click, per the
 * auto-curation requirement. Errors on individual files are swallowed (the
 * photo just doesn't get imported/analyzed and can be retried manually); a
 * total failure marks the job FAILED with a real error message.
 *
 * This runs detached from the request that created the job (see the
 * import API routes) — fine for a single-instance MVP; a real job queue
 * (BullMQ/Inngest) is the production upgrade path, same caveat as the
 * pre-existing batch photo-analysis code.
 */
export async function runCloudImportJob(jobId: string, provider: "GOOGLE_DRIVE" | "DROPBOX", folderId: string) {
  const job = await prisma.photoImportJob.findUniqueOrThrow({ where: { id: jobId }, include: { wedding: true } });

  try {
    const accessToken = await getValidAccessToken(job.wedding.organizationId, provider);
    if (!accessToken) {
      throw new Error(`${provider === "GOOGLE_DRIVE" ? "Google Drive" : "Dropbox"} is no longer connected — reconnect and try again.`);
    }
    const adapter = getCloudAdapter(provider);

    const images = await adapter.listImagesInFolder(accessToken, folderId);
    await prisma.photoImportJob.update({ where: { id: jobId }, data: { totalFiles: images.length, status: "IMPORTING" } });

    if (images.length === 0) {
      await prisma.photoImportJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
      return;
    }

    await mapWithConcurrency(images, 3, async (image: CloudImage) => {
      const download = await adapter.downloadImage(accessToken, image);
      await importPhotoBuffer({
        weddingId: job.weddingId,
        buffer: download.buffer,
        filename: download.filename,
        mimeType: download.mimeType || image.mimeType,
        importSource: provider,
        importJobId: jobId,
      });
    });

    await runAnalysisPhase(jobId, job.weddingId);
  } catch (err) {
    await prisma.photoImportJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Import failed." },
    });
  }
}

/**
 * Finalizes a device-upload job: the files are already on disk (uploaded
 * via the per-file route, tagged with this jobId as each one lands, for
 * its existing progress/concurrency/retry UX) — this just runs the same
 * auto-curation phase cloud imports get once the client signals uploading
 * is done.
 */
export async function runDeviceImportJob(jobId: string) {
  const job = await prisma.photoImportJob.findUniqueOrThrow({ where: { id: jobId } });
  try {
    await runAnalysisPhase(jobId, job.weddingId);
  } catch (err) {
    await prisma.photoImportJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Analysis failed." },
    });
  }
}

async function runAnalysisPhase(jobId: string, weddingId: string) {
  await prisma.photoImportJob.update({ where: { id: jobId }, data: { status: "ANALYZING" } });

  const pending = await prisma.photo.findMany({
    where: { weddingId, importJobId: jobId, analysis: null },
    select: { id: true },
  });

  await mapWithConcurrency(pending, 3, async (p) => {
    try {
      await analyzeAndSavePhoto(p.id);
    } catch {
      // A single photo failing analysis shouldn't fail the whole import —
      // it just stays unanalyzed and can be retried from the curation
      // board's per-photo "Analyze" action.
    }
  });

  await prisma.photoImportJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
}
