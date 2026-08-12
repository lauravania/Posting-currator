"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { brandSchema } from "@/lib/validation";
import type { FormState } from "@/app/actions/weddings";

const BRAND_KEYS = [
  "name",
  "description",
  "targetCustomer",
  "luxuryLevel",
  "positioning",
  "visualStyle",
  "preferredColors",
  "photographyStyle",
  "writingStyle",
  "wordsToUse",
  "wordsToAvoid",
  "primaryLocations",
];

export async function updateBrandAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const raw: Record<string, unknown> = {};
  for (const k of BRAND_KEYS) raw[k] = formData.get(k);

  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.brand.upsert({
    where: { organizationId: session.user.organizationId },
    create: { organizationId: session.user.organizationId, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/brand");
  return {};
}
