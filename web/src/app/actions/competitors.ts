"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireCompetitorInOrg } from "@/lib/db-scope";
import { competitorSchema } from "@/lib/validation";
import { getStorageAdapter } from "@/lib/storage";
import { randomId, sanitizeFilename } from "@/lib/id";
import type { FormState } from "@/app/actions/weddings";

export async function createCompetitorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = competitorSchema.safeParse({
    accountName: formData.get("accountName"),
    instagramUrl: formData.get("instagramUrl"),
    accountType: formData.get("accountType"),
    notes: formData.get("notes"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const competitor = await prisma.competitor.create({
    data: { organizationId: session.user.organizationId, ...parsed.data },
  });

  revalidatePath("/competitors");
  redirect(`/competitors/${competitor.id}`);
}

export async function deleteCompetitorAction(competitorId: string) {
  const session = await requireSession();
  await requireCompetitorInOrg(competitorId, session.user.organizationId);
  await prisma.competitor.delete({ where: { id: competitorId } });
  revalidatePath("/competitors");
  redirect("/competitors");
}

const listField = (v: FormDataEntryValue | null) =>
  typeof v === "string"
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

// Manual reference content only — a screenshot upload, a pasted URL, or a
// typed note about a competitor's post. We never fetch or scrape anything
// automatically (§9).
export async function createCompetitorPostAction(competitorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  await requireCompetitorInOrg(competitorId, session.user.organizationId);

  const sourceUrl = formData.get("sourceUrl");
  const caption = formData.get("caption");
  const postedAtRaw = formData.get("postedAt");
  const format = formData.get("format");
  const ctaPattern = formData.get("ctaPattern");
  const notes = formData.get("notes");
  const file = formData.get("screenshot");

  let screenshotKey: string | undefined;
  let sourceType = "manual_note";
  if (file instanceof File && file.size > 0) {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      return { error: "Screenshot must be JPG, PNG, or WEBP." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      await sharp(buffer).metadata();
    } catch {
      return { error: "Screenshot file is not a readable image." };
    }
    const storage = getStorageAdapter();
    const id = randomId();
    const ext = sanitizeFilename(file.name).split(".").pop() || "jpg";
    screenshotKey = `competitors/${competitorId}/${id}.${ext}`;
    await storage.put(screenshotKey, buffer, file.type);
    sourceType = "screenshot";
  } else if (sourceUrl) {
    sourceType = "url";
  }

  await prisma.competitorPost.create({
    data: {
      competitorId,
      sourceType,
      sourceUrl: sourceUrl ? String(sourceUrl) : undefined,
      screenshotKey,
      caption: caption ? String(caption) : undefined,
      postedAt: postedAtRaw ? new Date(String(postedAtRaw)) : undefined,
      format: format ? (String(format) as never) : undefined,
      categories: listField(formData.get("categories")),
      hashtags: listField(formData.get("hashtags")),
      collaborators: listField(formData.get("collaborators")),
      ctaPattern: ctaPattern ? String(ctaPattern) : undefined,
      notes: notes ? String(notes) : undefined,
    },
  });

  revalidatePath(`/competitors/${competitorId}`);
  return {};
}

export async function deleteCompetitorPostAction(competitorId: string, postId: string) {
  const session = await requireSession();
  await requireCompetitorInOrg(competitorId, session.user.organizationId);
  // Scope the delete to this competitor too (IDOR guard) — see
  // deleteVendorAction for the same pattern.
  await prisma.competitorPost.deleteMany({ where: { id: postId, competitorId } });
  revalidatePath(`/competitors/${competitorId}`);
}
