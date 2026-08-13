import OpenAI from "openai";
import { readFile } from "fs/promises";
import {
  type PhotoScoreInput,
  type PhotoScoreResult,
  type CaptionRequest,
  type CaptionResult,
  type ContentOpportunity,
  PHOTO_CATEGORIES,
} from "./types";

/**
 * Real OpenAI-backed provider. Only ever invoked when OPENAI_API_KEY is
 * set (see index.ts). Every call here is a genuine network request to the
 * OpenAI API — if the key is invalid or the request fails, it throws rather
 * than silently falling back to a fabricated result, per §25 ("do not fake
 * successful integrations").
 */

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    client = new OpenAI({ apiKey });
  }
  return client;
}

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

function extractJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export async function scorePhotoOpenAI(input: PhotoScoreInput): Promise<PhotoScoreResult> {
  const openai = getClient();
  const fileBuffer = await readFile(input.absolutePath);
  const base64 = fileBuffer.toString("base64");
  const mime = input.absolutePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const brand = input.brand;
  const wedding = input.wedding;
  const systemPrompt = `You are a photography editor and creative director for a luxury wedding brand. Score the submitted photograph honestly and specifically. Do not simply reward technical perfection — a technically imperfect photo can still score highly on emotional/editorial value if it earns it. Weigh brand fit against this SPECIFIC wedding's own concept, color palette, and story first — the org's general brand style is secondary context, not a replacement for it. Return ONLY a JSON object matching the requested schema, with every score as a number from 0 to 10.`;

  const userPrompt = `Brand context (general studio voice):
Name: ${brand.name}
Positioning: ${brand.positioning ?? "n/a"}
Visual style: ${brand.visualStyle.join(", ") || "n/a"}
Preferred colors: ${brand.preferredColors.join(", ") || "n/a"}
Words to avoid: ${brand.wordsToAvoid.join(", ") || "n/a"}

This wedding's specific creative direction (weigh this most heavily for brand fit):
Couple: ${wedding.coupleName}
Concept: ${wedding.concept ?? "n/a"}
Couple story: ${wedding.coupleStory ?? "n/a"}
Color palette: ${wedding.colorPalette.join(", ") || "n/a"}
Design keywords: ${wedding.designKeywords.join(", ") || "n/a"}
Location: ${wedding.location ?? "n/a"}
Vendor team: ${wedding.vendors.map((v) => `${v.name} (${v.category})`).join(", ") || "n/a"}

Score this photograph on each of the following (0-10), plus classify it.
Return JSON:
{
  "sharpnessScore": number, "exposureScore": number, "noiseScore": number, "focusScore": number,
  "resolutionScore": number, "lightingScore": number, "motionBlurScore": number,
  "framingScore": number, "balanceScore": number, "negativeSpaceScore": number,
  "subjectPlacementScore": number, "visualHierarchyScore": number, "architecturalScore": number,
  "emotionalImpactScore": number, "editorialFeelingScore": number, "storytellingScore": number, "uniquenessScore": number,
  "brandFitScore": number,
  "categories": string[] (choose from: ${PHOTO_CATEGORIES.join(", ")}),
  "detectedColors": string[] (up to 5 dominant color names),
  "detectedObjects": string[] (key visible subjects/objects),
  "detectedPeopleCount": number | null,
  "suggestedContentType": string,
  "verdictReason": string (1-2 sentences, specific to this photo — reference this wedding's concept/palette/story where it genuinely affected the score)
}`;

  const completion = await openai.chat.completions.create({
    model: VISION_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response while scoring the photo.");
  const parsed = extractJson<Record<string, unknown>>(raw);

  const num = (key: string) => Math.max(0, Math.min(10, Number(parsed[key] ?? 0)));

  const technicalScore =
    num("sharpnessScore") * 0.22 +
    num("focusScore") * 0.18 +
    num("exposureScore") * 0.16 +
    num("lightingScore") * 0.16 +
    num("noiseScore") * 0.13 +
    num("motionBlurScore") * 0.1 +
    num("resolutionScore") * 0.05;

  const compositionScore =
    num("framingScore") * 0.22 +
    num("balanceScore") * 0.2 +
    num("negativeSpaceScore") * 0.16 +
    num("subjectPlacementScore") * 0.2 +
    num("visualHierarchyScore") * 0.14 +
    num("architecturalScore") * 0.08;

  const editorialScore =
    num("emotionalImpactScore") * 0.3 +
    num("editorialFeelingScore") * 0.3 +
    num("storytellingScore") * 0.25 +
    num("uniquenessScore") * 0.15;

  const brandFitScore = num("brandFitScore");
  const totalScore = technicalScore * 0.25 + compositionScore * 0.25 + editorialScore * 0.3 + brandFitScore * 0.2;

  const verdict = totalScore >= 7.3 ? "KEEP" : totalScore >= 5.2 ? "MAYBE" : "REJECT";

  return {
    sharpnessScore: num("sharpnessScore"),
    exposureScore: num("exposureScore"),
    noiseScore: num("noiseScore"),
    focusScore: num("focusScore"),
    resolutionScore: num("resolutionScore"),
    lightingScore: num("lightingScore"),
    motionBlurScore: num("motionBlurScore"),
    technicalScore,
    framingScore: num("framingScore"),
    balanceScore: num("balanceScore"),
    negativeSpaceScore: num("negativeSpaceScore"),
    subjectPlacementScore: num("subjectPlacementScore"),
    visualHierarchyScore: num("visualHierarchyScore"),
    architecturalScore: num("architecturalScore"),
    compositionScore,
    emotionalImpactScore: num("emotionalImpactScore"),
    editorialFeelingScore: num("editorialFeelingScore"),
    storytellingScore: num("storytellingScore"),
    uniquenessScore: num("uniquenessScore"),
    editorialScore,
    brandFitScore,
    totalScore,
    verdict,
    verdictReason: String(parsed.verdictReason ?? ""),
    categories: (Array.isArray(parsed.categories) ? parsed.categories : []) as PhotoScoreResult["categories"],
    detectedColors: (Array.isArray(parsed.detectedColors) ? parsed.detectedColors : []) as string[],
    detectedObjects: (Array.isArray(parsed.detectedObjects) ? parsed.detectedObjects : []) as string[],
    detectedPeopleCount:
      typeof parsed.detectedPeopleCount === "number" ? parsed.detectedPeopleCount : null,
    suggestedContentType: String(parsed.suggestedContentType ?? "Feed post"),
    provider: "openai",
  };
}

export async function generateCaptionOpenAI(req: CaptionRequest): Promise<CaptionResult> {
  const openai = getClient();
  const brand = req.brand;

  const systemPrompt = `You are an elite social copywriter for luxury wedding brands. You write 100% original captions. You may study the STRUCTURE of reference/competitor content (pacing, hook style, CTA style) for inspiration, but you must NEVER reuse or closely paraphrase their wording. Avoid generic wedding language, clichés, and these forbidden words: ${brand.wordsToAvoid.join(", ") || "none specified"}. Favor these words/themes when natural: ${brand.wordsToUse.join(", ") || "none specified"}.`;

  const userPrompt = `Brand: ${brand.name}
Positioning: ${brand.positioning ?? "n/a"}
Writing style: ${brand.writingStyle.join(", ") || "n/a"}
Tone requested: ${req.tone}
Post concept: ${req.concept}
Photo categories featured: ${req.categories.join(", ")}
Location: ${req.location ?? "n/a"}
${req.referencePatterns?.length ? `Structural reference patterns observed in the market (do NOT copy wording, only structural inspiration): ${req.referencePatterns.join(" | ")}` : ""}

Return JSON:
{ "title": string, "hook": string, "caption": string, "shortCaption": string, "cta": string, "seoKeywords": string[], "hashtags": string[] }`;

  const completion = await openai.chat.completions.create({
    model: TEXT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response while generating the caption.");
  const parsed = extractJson<Record<string, unknown>>(raw);

  return {
    title: String(parsed.title ?? req.concept),
    hook: String(parsed.hook ?? ""),
    caption: String(parsed.caption ?? ""),
    shortCaption: String(parsed.shortCaption ?? ""),
    cta: String(parsed.cta ?? ""),
    seoKeywords: (Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : []) as string[],
    hashtags: (Array.isArray(parsed.hashtags) ? parsed.hashtags : []) as string[],
    provider: "openai",
  };
}

export async function detectOpportunitiesOpenAI(input: {
  weddingLabel: string;
  location: string | null;
  brand: { name: string; positioning: string | null; visualStyle: string[] };
  unusedKeepers: { id: string; categories: string[]; totalScore: number; verdictReason: string }[];
}): Promise<ContentOpportunity[]> {
  const openai = getClient();
  const systemPrompt = `You are a creative director for a luxury wedding brand, identifying the strongest unpublished content opportunities from a photo library. Be specific and editorial, not generic.`;
  const userPrompt = `Wedding: ${input.weddingLabel}${input.location ? ` (${input.location})` : ""}
Brand: ${input.brand.name}. Positioning: ${input.brand.positioning ?? "n/a"}. Visual style: ${input.brand.visualStyle.join(", ")}.
Unused high-scoring photos (id, categories, score):
${input.unusedKeepers.map((p) => `- ${p.id}: [${p.categories.join(", ")}] score=${p.totalScore.toFixed(1)}`).join("\n")}

Propose up to 3 content opportunities. Return JSON: { "opportunities": [{ "title": string, "concept": string, "hook": string, "format": "SINGLE_IMAGE"|"CAROUSEL"|"REEL"|"STORY", "photoIds": string[], "rationale": string }] }`;

  const completion = await openai.chat.completions.create({
    model: TEXT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned an empty response while detecting opportunities.");
  const parsed = extractJson<{ opportunities: ContentOpportunity[] }>(raw);
  return parsed.opportunities ?? [];
}
