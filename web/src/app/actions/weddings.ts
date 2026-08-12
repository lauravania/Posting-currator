"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { weddingSchema } from "@/lib/validation";

export type FormState = { error?: string };

function collect(formData: FormData, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = formData.get(k);
  return out;
}

const WEDDING_KEYS = [
  "coupleName",
  "weddingDate",
  "venue",
  "location",
  "planner",
  "stylist",
  "decorator",
  "photographer",
  "videographer",
  "makeupArtist",
  "florist",
  "dressDesigner",
  "otherVendors",
  "description",
  "coupleStory",
  "concept",
  "colorPalette",
  "designKeywords",
  "targetAudience",
];

export async function createWeddingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = weddingSchema.safeParse(collect(formData, WEDDING_KEYS));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const wedding = await prisma.wedding.create({
    data: { ...parsed.data, organizationId: session.user.organizationId },
  });

  revalidatePath("/weddings");
  revalidatePath("/dashboard");
  redirect(`/weddings/${wedding.id}`);
}

export async function updateWeddingAction(weddingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);

  const parsed = weddingSchema.safeParse(collect(formData, WEDDING_KEYS));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.wedding.update({ where: { id: weddingId }, data: parsed.data });

  revalidatePath(`/weddings/${weddingId}`);
  return {};
}

export async function deleteWeddingAction(weddingId: string) {
  const session = await requireSession();
  await requireWeddingInOrg(weddingId, session.user.organizationId);
  await prisma.wedding.delete({ where: { id: weddingId } });
  revalidatePath("/weddings");
  redirect("/weddings");
}
