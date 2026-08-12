import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getOptionalSession();
  redirect(session?.user?.organizationId ? "/dashboard" : "/login");
}
