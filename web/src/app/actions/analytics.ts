"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireContentPostInOrg } from "@/lib/db-scope";
import type { FormState } from "@/app/actions/weddings";

const NUMERIC_KEYS = ["reach", "impressions", "likes", "comments", "shares", "saves", "profileVisits", "followersGained"] as const;

export async function createAnalyticsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const contentPostId = String(formData.get("contentPostId") || "");
  if (!contentPostId) return { error: "Select a post." };
  await requireContentPostInOrg(contentPostId, session.user.organizationId);

  const data: Record<string, number> = {};
  for (const key of NUMERIC_KEYS) {
    const raw = formData.get(key);
    if (raw !== null && raw !== "") data[key] = Number(raw);
  }

  const reach = data.reach ?? 0;
  const engagements = (data.likes ?? 0) + (data.comments ?? 0) + (data.shares ?? 0) + (data.saves ?? 0);
  const engagementRate = reach > 0 ? Math.round((engagements / reach) * 1000) / 10 : null;

  await prisma.analytics.create({
    data: {
      organizationId: session.user.organizationId,
      contentPostId,
      ...data,
      engagementRate,
      source: "manual",
    },
  });

  revalidatePath("/analytics");
  return {};
}
