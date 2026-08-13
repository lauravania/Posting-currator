import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Creates the PhotoImportJob a device-upload batch will be tagged with,
// before any files are actually uploaded, so each per-file POST can carry
// jobId and the progress UI has a single resource to poll from the start.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const totalFiles = Number(body.totalFiles) || 0;

  const job = await prisma.photoImportJob.create({
    data: { weddingId: params.id, source: "DEVICE", status: "IMPORTING", totalFiles },
  });

  return NextResponse.json({ jobId: job.id });
}
