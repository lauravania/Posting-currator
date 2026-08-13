import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { parseProviderParam, getValidAccessToken } from "@/lib/cloud";
import { runCloudImportJob } from "@/lib/import-pipeline";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Selecting a folder is the trigger — this single call creates the job and
// kicks off download + import + AI curation, with no further action
// required (§ workflow requirement: "automatically import ... and trigger
// AI curation ... without requiring a second manual action").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();

  const limit = rateLimit(`cloud-import:${session.user.organizationId}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const provider = parseProviderParam(String(body.provider || ""));
  const folderId = String(body.folderId ?? "");
  const folderName = String(body.folderName || "Selected folder");

  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (!folderId) return NextResponse.json({ error: "folderId is required." }, { status: 400 });

  const accessToken = await getValidAccessToken(session.user.organizationId, provider);
  if (!accessToken) {
    return NextResponse.json({ error: `${provider === "GOOGLE_DRIVE" ? "Google Drive" : "Dropbox"} isn't connected.` }, { status: 409 });
  }

  const job = await prisma.photoImportJob.create({
    data: { weddingId: params.id, source: provider, status: "PENDING", sourceLabel: folderName },
  });

  void runCloudImportJob(job.id, provider, folderId);

  return NextResponse.json({ jobId: job.id });
}
