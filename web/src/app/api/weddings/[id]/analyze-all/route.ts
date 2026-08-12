import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { analyzeAllPendingForWedding } from "@/lib/curation";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300; // batch analysis can take a while in Demo Mode too

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  const limit = rateLimit(`analyze-all:${session.user.organizationId}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const results = await analyzeAllPendingForWedding(params.id);
  return NextResponse.json({ results });
}
