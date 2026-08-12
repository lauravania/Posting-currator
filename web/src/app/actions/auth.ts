"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const signupSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "studio";
}

export type SignupState = { error?: string };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(`signup:${ip}`, 8, 60_000);
  if (!limit.ok) return { error: "Too many attempts — please wait a moment and try again." };

  const parsed = signupSchema.safeParse({
    organizationName: formData.get("organizationName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { organizationName, name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let slug = slugify(organizationName);
  const slugTaken = await prisma.organization.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: organizationName, slug },
    });
    const user = await tx.user.create({
      data: { email: normalizedEmail, name, passwordHash },
    });
    await tx.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await tx.brand.create({
      data: {
        organizationId: org.id,
        name: organizationName,
        luxuryLevel: 8,
      },
    });
  });

  return {};
}
