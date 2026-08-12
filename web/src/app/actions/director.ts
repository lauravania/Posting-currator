"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { askDirector } from "@/lib/director";
import type { FormState } from "@/app/actions/weddings";

export async function askDirectorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const question = String(formData.get("question") || "").trim();
  if (!question) return { error: "Ask a question first." };

  const { answer } = await askDirector(session.user.organizationId, question);

  await prisma.aIRecommendation.create({
    data: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
      kind: "chat",
      prompt: question,
      response: answer,
    },
  });

  revalidatePath("/director");
  return {};
}
