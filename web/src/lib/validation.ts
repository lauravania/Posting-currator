import { z } from "zod";

const optionalText = z.preprocess((v) => (v === "" ? undefined : v), z.string().max(2000).optional());
const listField = z.preprocess((v) => {
  if (typeof v !== "string") return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}, z.array(z.string()));

export const weddingSchema = z.object({
  coupleName: z.string().trim().min(1, "Couple name is required").max(200),
  weddingDate: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  venue: optionalText,
  location: optionalText,
  planner: optionalText,
  stylist: optionalText,
  decorator: optionalText,
  photographer: optionalText,
  videographer: optionalText,
  makeupArtist: optionalText,
  florist: optionalText,
  dressDesigner: optionalText,
  otherVendors: optionalText,
  description: optionalText,
  coupleStory: optionalText,
  concept: optionalText,
  colorPalette: listField,
  designKeywords: listField,
  targetAudience: optionalText,
});

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  targetCustomer: optionalText,
  luxuryLevel: z.preprocess((v) => Number(v), z.number().min(1).max(10)),
  positioning: optionalText,
  visualStyle: listField,
  preferredColors: listField,
  photographyStyle: listField,
  writingStyle: listField,
  wordsToUse: listField,
  wordsToAvoid: listField,
  primaryLocations: listField,
});

export const vendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  instagramHandle: optionalText,
  category: z.string().trim().min(1).max(100),
  website: optionalText,
  location: optionalText,
  relationship: z.enum(["PARTNER", "CLIENT_HIRED", "ONE_OFF", "IN_HOUSE"]).default("ONE_OFF"),
  preferredTaggingFormat: optionalText,
});

export const competitorSchema = z.object({
  accountName: z.string().trim().min(1).max(200),
  instagramUrl: optionalText,
  accountType: z.enum(["PLANNER", "STYLIST", "PHOTOGRAPHER", "VENUE", "DECORATOR", "FLORIST", "OTHER"]).default("OTHER"),
  notes: optionalText,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB per photo
export const MAX_FILES_PER_UPLOAD = 60;
