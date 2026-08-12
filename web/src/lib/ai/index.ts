import type { PhotoScoreInput, PhotoScoreResult, CaptionRequest, CaptionResult, ContentOpportunity } from "./types";
import { scorePhotoDemoMode, generateCaptionDemoMode, detectOpportunitiesDemoMode } from "./demo-provider";
import { scorePhotoOpenAI, generateCaptionOpenAI, detectOpportunitiesOpenAI } from "./openai-provider";

export * from "./types";
export { buildHashtagsDemoMode as buildHashtags } from "./demo-provider";

export function isDemoMode(): boolean {
  return !process.env.OPENAI_API_KEY;
}

export async function analyzePhoto(input: PhotoScoreInput): Promise<PhotoScoreResult> {
  if (isDemoMode()) return scorePhotoDemoMode(input);
  return scorePhotoOpenAI(input);
}

export async function generateCaption(req: CaptionRequest): Promise<CaptionResult> {
  if (isDemoMode()) return generateCaptionDemoMode(req);
  return generateCaptionOpenAI(req);
}

export async function detectOpportunities(input: {
  weddingLabel: string;
  location: string | null;
  brand: { name: string; positioning: string | null; visualStyle: string[] };
  unusedKeepers: { id: string; categories: string[]; totalScore: number; verdictReason: string }[];
}): Promise<ContentOpportunity[]> {
  if (isDemoMode()) {
    return detectOpportunitiesDemoMode({
      weddingLabel: input.weddingLabel,
      location: input.location,
      unusedKeepers: input.unusedKeepers,
    });
  }
  return detectOpportunitiesOpenAI(input);
}
