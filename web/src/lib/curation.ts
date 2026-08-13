import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { analyzePhoto, type BrandProfile, type WeddingContext } from "@/lib/ai";

export function toBrandProfile(brand: {
  name: string;
  description: string | null;
  targetCustomer: string | null;
  luxuryLevel: number;
  visualStyle: string[];
  preferredColors: string[];
  photographyStyle: string[];
  writingStyle: string[];
  wordsToUse: string[];
  wordsToAvoid: string[];
  primaryLocations: string[];
  positioning: string | null;
}): BrandProfile {
  return { ...brand };
}

/**
 * Runs the AI photo analysis pipeline (§6) for one photo and persists the
 * result. Used by both the single-photo and batch "Run AI Curation"
 * endpoints so the two paths can never drift.
 */
export async function analyzeAndSavePhoto(photoId: string) {
  const photo = await prisma.photo.findUniqueOrThrow({
    where: { id: photoId },
    include: {
      wedding: { include: { organization: { include: { brand: true } }, vendors: true } },
    },
  });

  const brand = photo.wedding.organization.brand;
  const brandProfile: BrandProfile = brand
    ? toBrandProfile(brand)
    : {
        name: photo.wedding.organization.name,
        description: null,
        targetCustomer: null,
        luxuryLevel: 7,
        visualStyle: [],
        preferredColors: [],
        photographyStyle: [],
        writingStyle: [],
        wordsToUse: [],
        wordsToAvoid: [],
        primaryLocations: [],
        positioning: null,
      };

  // The specific wedding's own concept/palette/story/vendors — preserved
  // as first-class context for scoring, not just the org's general brand
  // voice (see WeddingContext in lib/ai/types.ts).
  const weddingContext: WeddingContext = {
    coupleName: photo.wedding.coupleName,
    concept: photo.wedding.concept,
    coupleStory: photo.wedding.coupleStory,
    colorPalette: photo.wedding.colorPalette,
    designKeywords: photo.wedding.designKeywords,
    location: photo.wedding.location,
    vendors: photo.wedding.vendors.map((v) => ({ name: v.name, category: v.category })),
  };

  const storage = getStorageAdapter();
  const absolutePath = await storage.resolveReadPath(photo.storageKey);

  const result = await analyzePhoto({
    absolutePath,
    originalFilename: photo.originalFilename,
    width: photo.width,
    height: photo.height,
    fileSizeBytes: photo.fileSizeBytes,
    brand: brandProfile,
    wedding: weddingContext,
  });

  await prisma.$transaction([
    prisma.photoAnalysis.upsert({
      where: { photoId },
      create: {
        photoId,
        sharpnessScore: result.sharpnessScore,
        exposureScore: result.exposureScore,
        noiseScore: result.noiseScore,
        focusScore: result.focusScore,
        resolutionScore: result.resolutionScore,
        lightingScore: result.lightingScore,
        motionBlurScore: result.motionBlurScore,
        technicalScore: result.technicalScore,
        framingScore: result.framingScore,
        balanceScore: result.balanceScore,
        negativeSpaceScore: result.negativeSpaceScore,
        subjectPlacementScore: result.subjectPlacementScore,
        visualHierarchyScore: result.visualHierarchyScore,
        architecturalScore: result.architecturalScore,
        compositionScore: result.compositionScore,
        emotionalImpactScore: result.emotionalImpactScore,
        editorialFeelingScore: result.editorialFeelingScore,
        storytellingScore: result.storytellingScore,
        uniquenessScore: result.uniquenessScore,
        editorialScore: result.editorialScore,
        brandFitScore: result.brandFitScore,
        totalScore: result.totalScore,
        verdict: result.verdict,
        verdictReason: result.verdictReason,
        provider: result.provider,
      },
      update: {
        sharpnessScore: result.sharpnessScore,
        exposureScore: result.exposureScore,
        noiseScore: result.noiseScore,
        focusScore: result.focusScore,
        resolutionScore: result.resolutionScore,
        lightingScore: result.lightingScore,
        motionBlurScore: result.motionBlurScore,
        technicalScore: result.technicalScore,
        framingScore: result.framingScore,
        balanceScore: result.balanceScore,
        negativeSpaceScore: result.negativeSpaceScore,
        subjectPlacementScore: result.subjectPlacementScore,
        visualHierarchyScore: result.visualHierarchyScore,
        architecturalScore: result.architecturalScore,
        compositionScore: result.compositionScore,
        emotionalImpactScore: result.emotionalImpactScore,
        editorialFeelingScore: result.editorialFeelingScore,
        storytellingScore: result.storytellingScore,
        uniquenessScore: result.uniquenessScore,
        editorialScore: result.editorialScore,
        brandFitScore: result.brandFitScore,
        totalScore: result.totalScore,
        verdict: result.verdict,
        verdictReason: result.verdictReason,
        provider: result.provider,
        analyzedAt: new Date(),
      },
    }),
    prisma.photo.update({
      where: { id: photoId },
      data: {
        categories: result.categories,
        detectedColors: result.detectedColors,
        detectedObjects: result.detectedObjects,
        detectedPeopleCount: result.detectedPeopleCount,
        suggestedContentType: result.suggestedContentType,
      },
    }),
  ]);

  return result;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function analyzeAllPendingForWedding(weddingId: string) {
  const pending = await prisma.photo.findMany({
    where: { weddingId, analysis: null },
    select: { id: true },
  });

  const results = await mapWithConcurrency(pending, 3, async (p) => {
    try {
      await analyzeAndSavePhoto(p.id);
      return { photoId: p.id, ok: true as const };
    } catch (err) {
      return { photoId: p.id, ok: false as const, error: err instanceof Error ? err.message : "Unknown error" };
    }
  });

  return results;
}
