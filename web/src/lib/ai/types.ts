export type BrandProfile = {
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
};

export const PHOTO_CATEGORIES = [
  "Couple portrait",
  "Ceremony",
  "Reception",
  "Tablescape",
  "Decor",
  "Floral",
  "Venue",
  "Architecture",
  "Bridal",
  "Groom",
  "Details",
  "Stationery",
  "Food",
  "Entertainment",
  "Guest interaction",
  "Dance floor",
  "Getting ready",
  "Behind the scenes",
  "Landscape",
  "Sunset",
  "Night",
  "Editorial",
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export type CurationVerdict = "KEEP" | "MAYBE" | "REJECT";

// Display-only label mapping — the DB enum stays KEEP/MAYBE/REJECT
// (already threaded through migrations, queries, and the curation board),
// but the product language is "Keep / Maybe / Skip".
export const VERDICT_DISPLAY_LABEL: Record<CurationVerdict, string> = {
  KEEP: "Keep",
  MAYBE: "Maybe",
  REJECT: "Skip",
};

export type PhotoScoreResult = {
  sharpnessScore: number;
  exposureScore: number;
  noiseScore: number;
  focusScore: number;
  resolutionScore: number;
  lightingScore: number;
  motionBlurScore: number;
  technicalScore: number;

  framingScore: number;
  balanceScore: number;
  negativeSpaceScore: number;
  subjectPlacementScore: number;
  visualHierarchyScore: number;
  architecturalScore: number;
  compositionScore: number;

  emotionalImpactScore: number;
  editorialFeelingScore: number;
  storytellingScore: number;
  uniquenessScore: number;
  editorialScore: number;

  brandFitScore: number;
  totalScore: number;
  verdict: CurationVerdict;
  verdictReason: string;

  categories: PhotoCategory[];
  detectedColors: string[];
  detectedObjects: string[];
  detectedPeopleCount: number | null;
  suggestedContentType: string;

  provider: "openai" | "demo-mode";
};

// The specific wedding's own creative direction — kept distinct from
// BrandProfile (the org's general voice/style) because a single studio's
// brand covers many weddings, each with its own concept/palette/story that
// should weigh at least as heavily when scoring brand fit and writing
// verdict rationale (see lib/curation.ts, demo-provider.ts, openai-provider.ts).
export type WeddingContext = {
  coupleName: string;
  concept: string | null;
  coupleStory: string | null;
  colorPalette: string[];
  designKeywords: string[];
  location: string | null;
  vendors: { name: string; category: string }[];
};

export type PhotoScoreInput = {
  absolutePath: string;
  originalFilename: string;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  brand: BrandProfile;
  wedding: WeddingContext;
};

export type CaptionTone =
  | "LUXURY_EDITORIAL"
  | "EMOTIONAL"
  | "MINIMAL"
  | "STORYTELLING"
  | "FASHION_EDITORIAL"
  | "SEO"
  | "PROFESSIONAL"
  | "PLAYFUL";

export type CaptionResult = {
  title: string;
  hook: string;
  caption: string;
  shortCaption: string;
  cta: string;
  seoKeywords: string[];
  hashtags: string[];
  provider: "openai" | "demo-mode";
};

export type CaptionRequest = {
  brand: BrandProfile;
  tone: CaptionTone;
  weddingSummary: string;
  concept: string;
  categories: string[];
  location: string | null;
  referencePatterns?: string[]; // competitor patterns to draw structural inspiration from, never wording
};

export type ContentOpportunity = {
  title: string;
  concept: string;
  hook: string;
  format: "SINGLE_IMAGE" | "CAROUSEL" | "REEL" | "STORY";
  photoIds: string[];
  rationale: string;
};
