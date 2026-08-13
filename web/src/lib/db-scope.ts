import { prisma } from "@/lib/prisma";

/**
 * Organization-level data isolation helpers (§21).
 *
 * Every domain table carries `organizationId` (directly, or transitively
 * via `weddingId -> Wedding.organizationId`). These helpers are the only
 * sanctioned way to fetch a wedding-scoped or org-scoped record — they
 * throw instead of silently returning another tenant's data, so a missing
 * check fails loudly in dev rather than leaking data in prod.
 */

export class NotFoundOrForbiddenError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundOrForbiddenError";
  }
}

export async function requireWeddingInOrg(weddingId: string, organizationId: string) {
  const wedding = await prisma.wedding.findFirst({
    where: { id: weddingId, organizationId },
  });
  if (!wedding) throw new NotFoundOrForbiddenError("Wedding");
  return wedding;
}

export async function requirePhotoInOrg(photoId: string, organizationId: string) {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, wedding: { organizationId } },
    include: { wedding: true, analysis: true },
  });
  if (!photo) throw new NotFoundOrForbiddenError("Photo");
  return photo;
}

export async function requireCompetitorInOrg(competitorId: string, organizationId: string) {
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, organizationId },
  });
  if (!competitor) throw new NotFoundOrForbiddenError("Competitor");
  return competitor;
}

export async function requireContentPostInOrg(contentPostId: string, organizationId: string) {
  const post = await prisma.contentPost.findFirst({
    where: { id: contentPostId, wedding: { organizationId } },
    include: { wedding: true, images: { include: { photo: true } } },
  });
  if (!post) throw new NotFoundOrForbiddenError("ContentPost");
  return post;
}

export async function requireImportJobInOrg(jobId: string, organizationId: string) {
  const job = await prisma.photoImportJob.findFirst({
    where: { id: jobId, wedding: { organizationId } },
    include: { wedding: true },
  });
  if (!job) throw new NotFoundOrForbiddenError("PhotoImportJob");
  return job;
}
