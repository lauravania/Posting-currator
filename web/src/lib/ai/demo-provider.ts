import { computeImageMetrics, type ImageMetrics } from "./image-metrics";
import { nearestColorName, parseColorToRgb, colorDistance } from "./color-names";
import {
  type PhotoScoreInput,
  type PhotoScoreResult,
  type PhotoCategory,
  type CaptionRequest,
  type CaptionResult,
  type ContentOpportunity,
} from "./types";

/**
 * Demo Mode: a fully functional, deterministic stand-in for the OpenAI
 * provider, used whenever OPENAI_API_KEY is not configured. Technical and
 * composition scores are computed from real pixel measurements (see
 * image-metrics.ts) — nothing here is random. Emotional/editorial value and
 * object/people detection genuinely require a vision-language model, so
 * those are conservatively approximated (editorial) or left unset
 * (detection) rather than faked, and every result is tagged
 * provider: "demo-mode" so the UI can disclose it.
 */

function clamp10(n: number) {
  return Math.max(0, Math.min(10, n));
}

function scoreFromRange(value: number, low: number, high: number) {
  // Maps value linearly onto 0-10 between [low, high], clamped.
  return clamp10(((value - low) / (high - low)) * 10);
}

function triangularScore(value: number, low: number, mid: number, high: number) {
  // Peaks at `mid`, falls off toward low/high — used for "not too dark, not
  // too bright" style measures.
  if (value <= low || value >= high) return 0;
  if (value === mid) return 10;
  if (value < mid) return scoreFromRange(value, low, mid);
  return scoreFromRange(high - value, 0, high - mid);
}

function deriveTechnical(metrics: ImageMetrics, fileSizeBytes: number) {
  const sharpnessScore = scoreFromRange(metrics.sharpnessGlobal, 0.2, 2.6);
  const focusScore = clamp10(
    scoreFromRange(metrics.sharpnessCenter, 0.2, 2.6) * 0.7 + sharpnessScore * 0.3
  );
  // Motion blur smears edge energy globally rather than just softening fine
  // detail, so it correlates strongly with overall sharpness; reuse that
  // signal directly as the "limited motion blur" proxy.
  const motionBlurScore = sharpnessScore;
  const exposureScore = triangularScore(metrics.meanBrightness, 25, 128, 235);
  const lightingScore = clamp10(exposureScore * 0.6 + scoreFromRange(metrics.brightnessStdev, 10, 70) * 0.4);
  // Noise proxy: extreme high-frequency energy that isn't matched by strong
  // center-focus sharpness suggests sensor noise rather than genuine detail.
  const noisyness = Math.max(0, metrics.sharpnessEdges - metrics.sharpnessCenter * 0.6);
  const noiseScore = clamp10(10 - scoreFromRange(noisyness, 0, 1.4));
  const megapixels = (metrics.width * metrics.height) / 1_000_000;
  const resolutionScore = clamp10(scoreFromRange(megapixels, 0.3, 12) * 0.85 + scoreFromRange(fileSizeBytes / 1_000_000, 0.3, 8) * 0.15);

  const technicalScore = clamp10(
    sharpnessScore * 0.22 +
      focusScore * 0.18 +
      exposureScore * 0.16 +
      lightingScore * 0.16 +
      noiseScore * 0.13 +
      motionBlurScore * 0.1 +
      resolutionScore * 0.05
  );

  return { sharpnessScore, exposureScore, noiseScore, focusScore, resolutionScore, lightingScore, motionBlurScore, technicalScore };
}

function deriveComposition(metrics: ImageMetrics) {
  const grid = metrics.gridEnergy;
  const total = grid.reduce((a, b) => a + b, 0) || 1;
  const thirdsCells = [grid[1], grid[3], grid[5], grid[7]]; // edge-midpoints closest to rule-of-thirds intersections region
  const thirdsShare = thirdsCells.reduce((a, b) => a + b, 0) / total;
  const framingScore = scoreFromRange(thirdsShare, 0.25, 0.55);

  const leftEnergy = grid[0] + grid[3] + grid[6];
  const rightEnergy = grid[2] + grid[5] + grid[8];
  const symmetry = 1 - Math.abs(leftEnergy - rightEnergy) / (leftEnergy + rightEnergy + 1);
  const balanceScore = scoreFromRange(symmetry, 0.4, 0.98);

  const emptyCells = grid.filter((v) => v < total / 9 / 3).length;
  const negativeSpaceScore = scoreFromRange(emptyCells, 0, 4);

  const centerEnergy = grid[4];
  const subjectPlacementScore = clamp10((framingScore + scoreFromRange(centerEnergy / total, 0.06, 0.28)) / 2);

  const variance = grid.reduce((a, b) => a + (b - total / 9) ** 2, 0) / 9;
  const visualHierarchyScore = scoreFromRange(Math.sqrt(variance), total / 60, total / 10);

  const lineDominance = Math.abs(metrics.horizontalEnergy - metrics.verticalEnergy) /
    (metrics.horizontalEnergy + metrics.verticalEnergy + 0.001);
  const architecturalScore = scoreFromRange(lineDominance, 0.05, 0.6);

  const compositionScore = clamp10(
    framingScore * 0.22 +
      balanceScore * 0.2 +
      negativeSpaceScore * 0.16 +
      subjectPlacementScore * 0.2 +
      visualHierarchyScore * 0.14 +
      architecturalScore * 0.08
  );

  return { framingScore, balanceScore, negativeSpaceScore, subjectPlacementScore, visualHierarchyScore, architecturalScore, compositionScore, lineDominance };
}

function deriveEditorial(technicalScore: number, compositionScore: number, metrics: ImageMetrics) {
  // Demo Mode cannot genuinely assess emotion/storytelling/uniqueness
  // without a vision-language model — this is a conservative proxy from
  // contrast + color richness + technical/composition quality, deliberately
  // compressed toward the middle so it never overstates confidence.
  const contrastRichness = scoreFromRange(metrics.brightnessStdev, 15, 65);
  const colorRichness = scoreFromRange(metrics.meanSaturation, 0.08, 0.55);
  const base = technicalScore * 0.35 + compositionScore * 0.35 + contrastRichness * 0.15 + colorRichness * 0.15;
  const compressed = 3 + (clamp10(base) / 10) * 5.5; // compress into ~3-8.5 band

  const emotionalImpactScore = clamp10(compressed);
  const editorialFeelingScore = clamp10(compressed * 0.95 + colorRichness * 0.05);
  const storytellingScore = clamp10(compressed * 0.9);
  const uniquenessScore = clamp10(compressed * 0.85 + contrastRichness * 0.15);
  const editorialScore = clamp10(
    emotionalImpactScore * 0.3 + editorialFeelingScore * 0.3 + storytellingScore * 0.25 + uniquenessScore * 0.15
  );

  return { emotionalImpactScore, editorialFeelingScore, storytellingScore, uniquenessScore, editorialScore };
}

function deriveBrandFit(metrics: ImageMetrics, preferredColors: string[]) {
  if (preferredColors.length === 0) return 6;
  const brandRgbs = preferredColors.map(parseColorToRgb).filter(Boolean) as [number, number, number][];
  if (brandRgbs.length === 0) return 6;
  const distances = brandRgbs.map((c) => colorDistance(metrics.meanColor, c));
  const minDist = Math.min(...distances);
  return scoreFromRange(441 - minDist, 0, 441); // 441 ~= max possible RGB distance
}

function deriveCategories(metrics: ImageMetrics, filename: string, editorialScore: number): PhotoCategory[] {
  const lower = filename.toLowerCase();
  const hints: [RegExp, PhotoCategory][] = [
    [/ceremon/, "Ceremony"],
    [/recept/, "Reception"],
    [/table|tablescape/, "Tablescape"],
    [/floral|flower|bouquet/, "Floral"],
    [/venue/, "Venue"],
    [/bridal|bride/, "Bridal"],
    [/groom/, "Groom"],
    [/detail/, "Details"],
    [/stationery|invite/, "Stationery"],
    [/food|cake|dinner/, "Food"],
    [/dance|dj|band/, "Dance floor"],
    [/gettingready|getting_ready|getting-ready|prep/, "Getting ready"],
    [/bts|behindthescenes|behind_the_scenes/, "Behind the scenes"],
    [/sunset|golden/, "Sunset"],
    [/night/, "Night"],
    [/portrait|couple/, "Couple portrait"],
    [/architect/, "Architecture"],
    [/landscape|view/, "Landscape"],
  ];
  const matched = hints.filter(([re]) => re.test(lower)).map(([, cat]) => cat);
  if (matched.length > 0) {
    if (editorialScore >= 7.5) matched.push("Editorial");
    return Array.from(new Set(matched)).slice(0, 3);
  }

  // Fall back to a pixel-signal-based guess when the filename carries no hint.
  const guesses: PhotoCategory[] = [];
  const isPortraitAspect = metrics.aspectRatio < 0.85;
  const isWideAspect = metrics.aspectRatio > 1.5;
  const isDark = metrics.meanBrightness < 70;
  const strongLines = Math.abs(metrics.horizontalEnergy - metrics.verticalEnergy) / (metrics.horizontalEnergy + metrics.verticalEnergy + 0.001) > 0.35;
  const warm = metrics.meanColor[0] > metrics.meanColor[2] + 15;

  if (isDark) guesses.push("Night");
  if (isWideAspect && strongLines) guesses.push("Architecture", "Venue");
  else if (isWideAspect) guesses.push("Landscape");
  if (isPortraitAspect && metrics.gridEnergy[4] > (metrics.gridEnergy.reduce((a, b) => a + b, 0) / 9) * 1.3) {
    guesses.push("Couple portrait");
  }
  if (!isWideAspect && !isPortraitAspect && metrics.meanSaturation > 0.3) guesses.push("Details");
  if (warm && metrics.meanBrightness > 150 && !isWideAspect) guesses.push("Sunset");
  if (guesses.length === 0) guesses.push("Details");
  if (editorialScore >= 7.5) guesses.push("Editorial");
  return Array.from(new Set(guesses)).slice(0, 3);
}

function suggestContentType(metrics: ImageMetrics): string {
  if (metrics.aspectRatio > 1.6) return "Carousel candidate (wide/landscape)";
  if (metrics.aspectRatio < 0.7) return "Story or Reel cover (tall)";
  return "Feed post";
}

function verdictFrom(totalScore: number, technicalScore: number, editorialScore: number): { verdict: "KEEP" | "MAYBE" | "REJECT"; reason: string } {
  if (totalScore >= 7.3) {
    return {
      verdict: "KEEP",
      reason:
        editorialScore >= technicalScore
          ? "Strong editorial and brand-fit signal carries this photo even where technical polish is merely solid."
          : "Technically clean with solid composition — a safe, brand-consistent keeper.",
    };
  }
  if (totalScore >= 5.2) {
    return {
      verdict: "MAYBE",
      reason: "Usable, but doesn't clear the bar on enough dimensions to be a clear pick — worth a second look for context (behind-the-scenes, Stories) rather than the primary feed.",
    };
  }
  return {
    verdict: "REJECT",
    reason: "Falls short on technical quality and composition without enough editorial value to compensate.",
  };
}

export async function scorePhotoDemoMode(input: PhotoScoreInput): Promise<PhotoScoreResult> {
  const metrics = await computeImageMetrics(input.absolutePath);
  const technical = deriveTechnical(metrics, input.fileSizeBytes);
  const composition = deriveComposition(metrics);
  const editorial = deriveEditorial(technical.technicalScore, composition.compositionScore, metrics);
  const brandFitScore = deriveBrandFit(metrics, input.brand.preferredColors);

  const totalScore = clamp10(
    technical.technicalScore * 0.25 + composition.compositionScore * 0.25 + editorial.editorialScore * 0.3 + brandFitScore * 0.2
  );
  const { verdict, reason } = verdictFrom(totalScore, technical.technicalScore, editorial.editorialScore);

  const categories = deriveCategories(metrics, input.originalFilename, editorial.editorialScore);
  const detectedColors = Array.from(new Set(metrics.samplePalette.map(nearestColorName))).slice(0, 5);

  return {
    ...technical,
    ...composition,
    ...editorial,
    brandFitScore,
    totalScore,
    verdict,
    verdictReason: reason,
    categories,
    detectedColors,
    detectedObjects: [],
    detectedPeopleCount: null,
    suggestedContentType: suggestContentType(metrics),
    provider: "demo-mode",
  };
}

// ---------------------------------------------------------------------------
// Rule-based copywriting (Demo Mode fallback for the AI Copywriter)
// ---------------------------------------------------------------------------

const TONE_OPENERS: Record<CaptionRequest["tone"], string[]> = {
  LUXURY_EDITORIAL: ["A quiet kind of grandeur.", "Some celebrations are designed. This one was composed.", "Elegance, unhurried."],
  EMOTIONAL: ["There was a moment the whole room felt it.", "Some love stories ask to be witnessed slowly.", "This is what it looks like when two families become one."],
  MINIMAL: ["Simple. Considered. Unforgettable.", "Less noise. More feeling.", "The details spoke for themselves."],
  STORYTELLING: ["It began, as most good stories do, with a view worth building a life around.", "Every wedding tells a story. This one had a plot twist worth remembering."],
  FASHION_EDITORIAL: ["Styled like a runway. Felt like home.", "Editorial in every frame, personal in every detail."],
  SEO: ["Planning a destination wedding? Here's what a truly considered celebration looks like."],
  PROFESSIONAL: ["A celebration built on precise creative direction and flawless execution."],
  PLAYFUL: ["Confetti, vows, and one very good playlist.", "Proof that weddings can be beautiful *and* fun."],
};

const TONE_CTAS: Record<CaptionRequest["tone"], string[]> = {
  LUXURY_EDITORIAL: ["Enquire about your own destination celebration — link in bio.", "Your story, composed with the same care. DM to begin."],
  EMOTIONAL: ["If this moved you, imagine standing in it. Let's talk about your day.", "Save this for the couple who needs to see it."],
  MINIMAL: ["Details, on request.", "More in bio."],
  STORYTELLING: ["Want your story told this way? Reach out to start planning.", "Chapter one starts with a conversation — DM us."],
  FASHION_EDITORIAL: ["Book your editorial consultation — link in bio.", "Styled to your story. Enquire today."],
  SEO: ["Contact our destination wedding planning team to start your Bali wedding.", "Get in touch to plan your luxury destination wedding."],
  PROFESSIONAL: ["For enquiries and availability, reach out via the link in bio.", "Consultations open for the upcoming season — DM to enquire."],
  PLAYFUL: ["Tag your plus-one. You're next.", "Ready for your own unforgettable day? Let's chat."],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function seedFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function generateCaptionDemoMode(req: CaptionRequest): CaptionResult {
  const seed = seedFromString(req.concept + req.tone);
  const hook = pick(TONE_OPENERS[req.tone], seed);
  const location = req.location ?? req.brand.primaryLocations[0] ?? "an unforgettable setting";
  const styleWords = req.brand.visualStyle.slice(0, 3).join(", ") || "elegant, editorial, timeless";

  const bodyParts = [
    req.concept,
    `Set in ${location}, this celebration leaned into ${styleWords} details — from the first look to the last dance.`,
    req.brand.positioning ? req.brand.positioning : "Every element was chosen to feel considered, never generic.",
  ];
  const caption = bodyParts.filter(Boolean).join(" ");
  const shortCaption = `${req.concept} 📍 ${location}`;
  const cta = pick(TONE_CTAS[req.tone], seed + 1);

  const seoKeywords = Array.from(
    new Set([
      `${location} wedding`,
      "luxury destination wedding",
      `${req.brand.name} wedding planner`,
      ...req.categories.map((c) => `${c.toLowerCase()} wedding photography`),
    ])
  ).slice(0, 8);

  const hashtags = buildHashtagsDemoMode({
    location,
    brandName: req.brand.name,
    categories: req.categories,
    luxuryLevel: req.brand.luxuryLevel,
  });

  return {
    title: req.concept.length > 60 ? req.concept.slice(0, 57) + "…" : req.concept,
    hook,
    caption,
    shortCaption,
    cta,
    seoKeywords,
    hashtags,
    provider: "demo-mode",
  };
}

export function buildHashtagsDemoMode(opts: {
  location: string;
  brandName: string;
  categories: string[];
  luxuryLevel: number;
  weddingType?: string;
  venue?: string;
}): string[] {
  const loc = opts.location.replace(/[^a-zA-Z ]/g, "").split(",")[0]?.trim().replace(/\s+/g, "") || "Destination";
  const brand = opts.brandName.replace(/[^a-zA-Z ]/g, "").replace(/\s+/g, "");
  const tags = new Set<string>([
    `#${loc}Wedding`,
    `#${loc}DestinationWedding`,
    `#LuxuryWedding${loc}`,
    `#${brand}`,
    "#DestinationWedding",
    "#LuxuryDestinationWedding",
  ]);
  if (opts.luxuryLevel >= 7) tags.add("#LuxuryWeddingPlanner");
  if (opts.venue) tags.add(`#${opts.venue.replace(/[^a-zA-Z ]/g, "").replace(/\s+/g, "")}`);
  for (const c of opts.categories.slice(0, 4)) {
    tags.add(`#${c.replace(/[^a-zA-Z ]/g, "").replace(/\s+/g, "")}`);
  }
  return Array.from(tags).slice(0, 12);
}

export function detectOpportunitiesDemoMode(input: {
  weddingLabel: string;
  location: string | null;
  unusedKeepers: { id: string; categories: string[]; totalScore: number }[];
}): ContentOpportunity[] {
  const { unusedKeepers } = input;
  if (unusedKeepers.length === 0) return [];

  const byCategory = new Map<string, typeof unusedKeepers>();
  for (const p of unusedKeepers) {
    const cat = p.categories[0] ?? "Editorial";
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), p]);
  }

  const opportunities: ContentOpportunity[] = [];
  const sortedGroups = Array.from(byCategory.entries()).sort((a, b) => b[1].length - a[1].length);

  for (const [category, photos] of sortedGroups.slice(0, 3)) {
    const top = photos.sort((a, b) => b.totalScore - a.totalScore).slice(0, Math.min(6, Math.max(3, photos.length)));
    opportunities.push({
      title: `${category} carousel from ${input.weddingLabel}`,
      concept: `An editorial look at the ${category.toLowerCase()} moments from ${input.weddingLabel}${
        input.location ? ` in ${input.location}` : ""
      }.`,
      hook: "Some weddings are designed around the view. Others become part of it.",
      format: top.length > 1 ? "CAROUSEL" : "SINGLE_IMAGE",
      photoIds: top.map((p) => p.id),
      rationale: `You have ${photos.length} unused ${category.toLowerCase()} photograph${photos.length === 1 ? "" : "s"} from this wedding scoring above your keep threshold — a strong, still-unpublished content set.`,
    });
  }
  return opportunities;
}
