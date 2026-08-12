import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * Every authenticated server component / server action should go through
 * this helper rather than calling getServerSession directly — it's the one
 * place that guarantees a request without a valid, org-attached session
 * never reaches a data query. Combined with the `org*` helpers in
 * db-scope.ts, this is how organization-level data isolation (§21) is
 * enforced: no query in the app should ever run without an organizationId
 * sourced from here.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  return session;
}

export async function getOptionalSession() {
  return getServerSession(authOptions);
}
