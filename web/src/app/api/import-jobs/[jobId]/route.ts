import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireImportJobInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { getImportJobProgress } from "@/lib/import-pipeline";

export const runtime = "nodejs";

// Single resource the client polls to drive the Importing -> Analyzing ->
// Completed progress UI, regardless of source (device/Drive/Dropbox).
export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await requireSession();
  try {
    await requireImportJobInOrg(params.jobId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const progress = await getImportJobProgress(params.jobId);
  if (!progress) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ job: progress });
}
