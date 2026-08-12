import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { randomId, sanitizeFilename } from "@/lib/id";

export const runtime = "nodejs";

// One photo per POST (§5/§21: validated file type, size-limited, rate
// limited). The client dropzone posts files individually/in small
// concurrency so a single request never needs to hold an entire batch in
// memory, and so per-file progress/errors are reportable.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();

  const limit = rateLimit(`upload:${session.user.organizationId}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many uploads — please slow down." }, { status: 429 });
  }

  let wedding;
  try {
    wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}. Use JPG, PNG, or WEBP.` }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).` }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Re-validate the actual bytes, not just the browser-reported MIME type.
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return NextResponse.json({ error: "File is not a readable image." }, { status: 400 });
  }
  if (!metadata.width || !metadata.height) {
    return NextResponse.json({ error: "Could not read image dimensions." }, { status: 400 });
  }

  const storage = getStorageAdapter();
  const id = randomId();
  const safeName = sanitizeFilename(file.name || "photo.jpg");
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  const originalKey = `weddings/${wedding.id}/photos/${id}.${ext}`;
  const thumbKey = `weddings/${wedding.id}/thumbs/${id}.jpg`;

  const thumbBuffer = await sharp(buffer).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();

  await storage.put(originalKey, buffer, file.type);
  await storage.put(thumbKey, thumbBuffer, "image/jpeg");

  const photo = await prisma.photo.create({
    data: {
      weddingId: wedding.id,
      storageKey: originalKey,
      thumbnailKey: thumbKey,
      originalFilename: safeName,
      mimeType: file.type,
      fileSizeBytes: buffer.byteLength,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.width / metadata.height,
    },
  });

  return NextResponse.json({ photo });
}
