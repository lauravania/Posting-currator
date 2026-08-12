"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, requireContentPostInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { detectOpportunities } from "@/lib/ai";
import { toBrandProfile } from "@/lib/curation";
import { buildPostContent } from "@/lib/content-generation";
import type { CaptionTone } from "@/lib/ai";
import type { FormState } from "@/app/actions/weddings";

export async function detectOpportunitiesAction(weddingId: string) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(weddingId, session.user.organizationId);

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId }, include: { brand: true } });

  const usedPhotoIds = new Set(
    (await prisma.contentPostImage.findMany({ where: { photo: { weddingId } }, select: { photoId: true } })).map((r) => r.photoId)
  );

  const unusedKeepers = (
    await prisma.photo.findMany({
      where: { weddingId, analysis: { verdict: "KEEP" } },
      include: { analysis: true },
    })
  )
    .filter((p) => !usedPhotoIds.has(p.id))
    .map((p) => ({ id: p.id, categories: p.categories, totalScore: p.analysis!.totalScore, verdictReason: p.analysis!.verdictReason ?? "" }));

  const brand = org.brand
    ? toBrandProfile(org.brand)
    : { name: org.name, positioning: null, visualStyle: [] as string[] };

  const opportunities = await detectOpportunities({
    weddingLabel: wedding.coupleName,
    location: wedding.location,
    brand: { name: brand.name, positioning: brand.positioning, visualStyle: brand.visualStyle },
    unusedKeepers,
  });

  for (const opp of opportunities) {
    await prisma.contentIdea.create({
      data: {
        weddingId,
        title: opp.title,
        concept: opp.concept,
        hook: opp.hook,
        format: opp.format,
        rationale: opp.rationale,
        photoIds: opp.photoIds,
      },
    });
  }

  revalidatePath(`/weddings/${weddingId}/content`);
}

export async function createPostFromIdeaAction(weddingId: string, ideaId: string) {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);

  const found = await prisma.contentIdea.findFirst({ where: { id: ideaId, weddingId } });
  if (!found) throw new NotFoundOrForbiddenError("ContentIdea");

  const { caption, hashtags, vendorTags, timeRec } = await buildPostContent({
    weddingId,
    photoIds: found.photoIds,
    concept: found.concept,
    tone: "LUXURY_EDITORIAL",
    format: found.format,
  });

  const post = await prisma.contentPost.create({
    data: {
      weddingId,
      contentIdeaId: found.id,
      title: caption.title,
      hook: found.hook ?? caption.hook,
      caption: caption.caption,
      shortCaption: caption.shortCaption,
      cta: caption.cta,
      seoKeywords: caption.seoKeywords,
      hashtags,
      tone: "LUXURY_EDITORIAL",
      format: found.format,
      collaborators: vendorTags.primaryCollaborator ? [vendorTags.primaryCollaborator.id] : [],
      status: "DRAFT",
      recommendedTime: timeRec.time,
      timeConfidence: timeRec.confidence,
      timeReason: timeRec.reason,
      images: { create: found.photoIds.map((photoId, order) => ({ photoId, order })) },
    },
  });

  revalidatePath(`/weddings/${weddingId}/content`);
  redirect(`/weddings/${weddingId}/content/${post.id}`);
}

export async function createManualPostAction(weddingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);

  const photoIds = formData.getAll("photoIds").map(String);
  if (photoIds.length === 0) return { error: "Select at least one photo." };

  const tone = String(formData.get("tone") || "LUXURY_EDITORIAL") as CaptionTone;
  const format = String(formData.get("format") || "CAROUSEL") as "SINGLE_IMAGE" | "CAROUSEL" | "REEL" | "STORY";
  const concept = String(formData.get("concept") || "") || "An editorial look at this celebration.";

  const { caption, hashtags, vendorTags, timeRec } = await buildPostContent({ weddingId, photoIds, concept, tone, format });

  const post = await prisma.contentPost.create({
    data: {
      weddingId,
      title: caption.title,
      hook: caption.hook,
      caption: caption.caption,
      shortCaption: caption.shortCaption,
      cta: caption.cta,
      seoKeywords: caption.seoKeywords,
      hashtags,
      tone,
      format,
      collaborators: vendorTags.primaryCollaborator ? [vendorTags.primaryCollaborator.id] : [],
      status: "DRAFT",
      recommendedTime: timeRec.time,
      timeConfidence: timeRec.confidence,
      timeReason: timeRec.reason,
      images: { create: photoIds.map((photoId, order) => ({ photoId, order })) },
    },
  });

  revalidatePath(`/weddings/${weddingId}/content`);
  redirect(`/weddings/${weddingId}/content/${post.id}`);
}

export async function regenerateCaptionAction(postId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const post = await requireContentPostInOrg(postId, session.user.organizationId);

  const tone = String(formData.get("tone") || post.tone) as CaptionTone;
  const concept = String(formData.get("concept") || post.title || "An editorial look at this celebration.");

  const { caption, hashtags } = await buildPostContent({
    weddingId: post.weddingId,
    photoIds: post.images.map((i) => i.photoId),
    concept,
    tone,
    format: post.format,
  });

  await prisma.contentPost.update({
    where: { id: postId },
    data: {
      title: caption.title,
      hook: caption.hook,
      caption: caption.caption,
      shortCaption: caption.shortCaption,
      cta: caption.cta,
      seoKeywords: caption.seoKeywords,
      hashtags,
      tone,
    },
  });

  revalidatePath(`/weddings/${post.weddingId}/content/${postId}`);
  return {};
}

const EDITABLE_KEYS = ["title", "hook", "caption", "shortCaption", "cta", "status", "scheduledFor", "recommendedTime"] as const;

export async function updatePostAction(postId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const post = await requireContentPostInOrg(postId, session.user.organizationId);

  const data: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const value = formData.get(key);
    if (value === null) continue;
    if (key === "scheduledFor") {
      data.scheduledFor = value ? new Date(String(value)) : null;
    } else {
      data[key] = String(value);
    }
  }

  const hashtagsRaw = formData.get("hashtags");
  if (typeof hashtagsRaw === "string") {
    data.hashtags = hashtagsRaw
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }
  const collaboratorsRaw = formData.getAll("collaborators").map(String);
  if (collaboratorsRaw.length >= 0 && formData.has("collaborators")) {
    data.collaborators = collaboratorsRaw;
  }

  await prisma.contentPost.update({ where: { id: post.id }, data });
  revalidatePath(`/weddings/${post.weddingId}/content/${postId}`);
  revalidatePath(`/calendar`);
  return {};
}

// Single-argument variant of updatePostAction for plain (non-useFormState)
// forms, like the Content Calendar's inline status dropdown.
export async function setPostStatusAction(postId: string, formData: FormData) {
  await updatePostAction(postId, {}, formData);
}

export async function deletePostAction(weddingId: string, postId: string) {
  const session = await requireSession();
  await requireContentPostInOrg(postId, session.user.organizationId);
  await prisma.contentPost.delete({ where: { id: postId } });
  revalidatePath(`/weddings/${weddingId}/content`);
  redirect(`/weddings/${weddingId}/content`);
}
