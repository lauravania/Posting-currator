import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { importPhotoBuffer } from "@/lib/import-pipeline";

export const runtime = "nodejs";

// One photo per POST (§5/§21: validated file type, size-limited, rate
// limited). The client dropzone posts files individually/in small
// concurrency so a single request never needs to hold an entire batch in
// memory, and so per-file progress/errors are reportable. An optional
// `jobId` (from /api/weddings/[id]/import/jobs) tags each photo with the
// PhotoImportJob driving the Importing -> Analyzing progress UI.
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

  const jobIdRaw = formData.get("jobId");
  let jobId: string | undefined;
  if (typeof jobIdRaw === "string" && jobIdRaw) {
    const job = await prisma.photoImportJob.findFirst({ where: { id: jobIdRaw, weddingId: wedding.id } });
    if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
    jobId = job.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const photo = await importPhotoBuffer({
      weddingId: wedding.id,
      buffer,
      filename: file.name,
      mimeType: file.type,
      importSource: "DEVICE",
      importJobId: jobId,
    });
    return NextResponse.json({ photo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
  }
}
