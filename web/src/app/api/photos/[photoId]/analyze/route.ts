import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePhotoInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { analyzeAndSavePhoto } from "@/lib/curation";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { photoId: string } }) {
  const session = await requireSession();
  const limit = rateLimit(`analyze:${session.user.organizationId}`, 200, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    await requirePhotoInOrg(params.photoId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  try {
    const result = await analyzeAndSavePhoto(params.photoId);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed." },
      { status: 502 }
    );
  }
}
