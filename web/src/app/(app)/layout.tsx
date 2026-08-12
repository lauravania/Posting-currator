import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";
import { Sidebar } from "@/components/nav/sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen bg-ivory">
      <Sidebar organizationName={session.user.organizationName} userName={session.user.name} />
      <main className="flex-1 min-w-0">
        <div className="max-w-editorial mx-auto px-10 py-10">{children}</div>
      </main>
    </div>
  );
}
