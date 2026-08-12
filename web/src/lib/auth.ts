import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

// Auth: NextAuth (Credentials + Prisma), chosen so the app has a fully
// working, self-contained login/signup flow without requiring a live
// Supabase project's URL/keys. The session/org model is the same shape
// Supabase Auth would populate, so swapping providers later doesn't
// require a data-model change — see README "Architecture decisions".
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Throttle login attempts per email to blunt credential-stuffing /
        // brute-force attempts against a known address (§21).
        const limit = rateLimit(`login:${credentials.email.toLowerCase()}`, 10, 60_000);
        if (!limit.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { memberships: { include: { organization: true }, take: 1 } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          organizationId: membership?.organizationId ?? "",
          organizationName: membership?.organization?.name ?? "",
          role: membership?.role ?? "VIEWER",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          organizationId: string;
          organizationName: string;
          role: string;
        };
        token.userId = u.id;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationName = token.organizationName as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
