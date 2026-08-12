import { prisma } from "@/lib/prisma";
import { generateCaption, buildHashtags, type CaptionTone } from "@/lib/ai";
import { toBrandProfile } from "@/lib/curation";
import { recommendVendorTags } from "@/lib/tagging";
import { recommendPostingTime } from "@/lib/posting-time";
import { analyzeCompetitorPosts } from "@/lib/competitor-analysis";

/**
 * Shared pipeline used by both the Content Opportunity Engine and the
 * manual post builder: given a wedding + a set of photo ids, generate an
 * original caption, hashtags, vendor tag suggestions, and a posting-time
 * recommendation — everything Content Studio needs to hand a human an
 * approve-ready draft.
 */
export async function buildPostContent(params: {
  weddingId: string;
  photoIds: string[];
  concept: string;
  tone: CaptionTone;
  format: "SINGLE_IMAGE" | "CAROUSEL" | "REEL" | "STORY";
}) {
  const wedding = await prisma.wedding.findUniqueOrThrow({
    where: { id: params.weddingId },
    include: { organization: { include: { brand: true, competitors: { include: { posts: true } } } }, vendors: true },
  });

  const photos = await prisma.photo.findMany({ where: { id: { in: params.photoIds } } });
  const categories = Array.from(new Set(photos.flatMap((p) => p.categories)));

  const brand = wedding.organization.brand
    ? toBrandProfile(wedding.organization.brand)
    : {
        name: wedding.organization.name,
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

  const referencePatterns = wedding.organization.competitors
    .flatMap((c) => c.posts)
    .slice(0, 20)
    .map((p) => `${p.format ?? "post"} featuring ${p.categories.join("/")}${p.ctaPattern ? `, CTA style: "${p.ctaPattern}"` : ""}`);

  const caption = await generateCaption({
    brand,
    tone: params.tone,
    weddingSummary: wedding.description ?? wedding.concept ?? `${wedding.coupleName}'s wedding`,
    concept: params.concept,
    categories,
    location: wedding.location,
    referencePatterns: referencePatterns.length ? referencePatterns : undefined,
  });

  const hashtags = Array.from(
    new Set([
      ...caption.hashtags,
      ...buildHashtags({
        location: wedding.location ?? brand.primaryLocations[0] ?? "Destination",
        brandName: brand.name,
        categories,
        luxuryLevel: brand.luxuryLevel,
        venue: wedding.venue ?? undefined,
      }),
    ])
  ).slice(0, 15);

  const vendorTags = recommendVendorTags(
    categories,
    wedding.vendors.map((v) => ({ id: v.id, name: v.name, category: v.category, instagramHandle: v.instagramHandle }))
  );

  const allCompetitorPosts = wedding.organization.competitors.flatMap((c) => c.posts);
  const competitorAnalysis = analyzeCompetitorPosts(allCompetitorPosts);

  const analyticsSamples = await prisma.analytics.findMany({
    where: { organizationId: wedding.organizationId },
    select: { recordedAt: true, engagementRate: true },
  });

  const timeRec = recommendPostingTime({
    analyticsSamples,
    competitorDayFrequency: competitorAnalysis?.dayFrequency ?? [],
    contentFormat: params.format,
  });

  return { caption, hashtags, vendorTags, timeRec, categories };
}
