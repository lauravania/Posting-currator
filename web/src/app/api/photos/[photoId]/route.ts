import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePhotoInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";

export const runtime = "nodejs";

// Manual override (§6/§24: "the user must be able to manually override
// every AI decision") — lets the curator change the verdict and/or
// categories the AI assigned.
export async function PATCH(req: NextRequest, { params }: { params: { photoId: string } }) {
  const session = await requireSession();
  let photo;
  try {
    photo = await requirePhotoInOrg(params.photoId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { verdict, categories } = body as { verdict?: string; categories?: string[] };

  if (verdict && !["KEEP", "MAYBE", "REJECT", "PENDING"].includes(verdict)) {
    return NextResponse.json({ error: "Invalid verdict." }, { status: 400 });
  }

  if (verdict) {
    await prisma.photoAnalysis.upsert({
      where: { photoId: photo.id },
      update: { verdict: verdict as never, verdictReason: "Manually overridden by a team member." },
      create: {
        photoId: photo.id,
        sharpnessScore: 0,
        exposureScore: 0,
        noiseScore: 0,
        focusScore: 0,
        resolutionScore: 0,
        lightingScore: 0,
        motionBlurScore: 0,
        technicalScore: 0,
        framingScore: 0,
        balanceScore: 0,
        negativeSpaceScore: 0,
        subjectPlacementScore: 0,
        visualHierarchyScore: 0,
        architecturalScore: 0,
        compositionScore: 0,
        emotionalImpactScore: 0,
        editorialFeelingScore: 0,
        storytellingScore: 0,
        uniquenessScore: 0,
        editorialScore: 0,
        brandFitScore: 0,
        totalScore: 0,
        verdict: verdict as never,
        verdictReason: "Manually set — not yet AI-analyzed.",
        provider: "demo-mode",
      },
    });
  }

  if (categories) {
    await prisma.photo.update({ where: { id: photo.id }, data: { categories } });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { photoId: string } }) {
  const session = await requireSession();
  let photo;
  try {
    photo = await requirePhotoInOrg(params.photoId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const storage = getStorageAdapter();
  await storage.delete(photo.storageKey);
  if (photo.thumbnailKey) await storage.delete(photo.thumbnailKey);
  await prisma.photo.delete({ where: { id: photo.id } });

  return NextResponse.json({ ok: true });
}
