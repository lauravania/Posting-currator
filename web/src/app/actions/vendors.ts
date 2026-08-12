"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { vendorSchema } from "@/lib/validation";
import type { FormState } from "@/app/actions/weddings";

export async function createVendorAction(weddingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);

  const parsed = vendorSchema.safeParse({
    name: formData.get("name"),
    instagramHandle: formData.get("instagramHandle"),
    category: formData.get("category"),
    website: formData.get("website"),
    location: formData.get("location"),
    relationship: formData.get("relationship"),
    preferredTaggingFormat: formData.get("preferredTaggingFormat"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.vendor.create({ data: { weddingId, ...parsed.data } });
  revalidatePath(`/weddings/${weddingId}/vendors`);
  return {};
}

export async function deleteVendorAction(weddingId: string, vendorId: string) {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);
  // Scope the delete to this wedding too — weddingId ownership alone isn't
  // enough to prove vendorId belongs to it (IDOR guard).
  await prisma.vendor.deleteMany({ where: { id: vendorId, weddingId } });
  revalidatePath(`/weddings/${weddingId}/vendors`);
}
