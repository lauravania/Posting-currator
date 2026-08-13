import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { runDeviceImportJob } from "@/lib/import-pipeline";

export const runtime = "nodejs";

// Signals "all device files are uploaded" — auto-triggers AI curation on
// the batch without a second manual action, per the workflow requirement.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.jobId || "");
  const job = await prisma.photoImportJob.findFirst({ where: { id: jobId, weddingId: params.id, source: "DEVICE" } });
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  // Fire-and-forget: the response returns immediately with the jobId the
  // client is already polling; analysis progress is reported through that
  // same job resource (see import-pipeline.ts for the production caveat
  // about moving this to a real job queue at scale).
  void runDeviceImportJob(job.id);

  return NextResponse.json({ ok: true, jobId: job.id });
}
