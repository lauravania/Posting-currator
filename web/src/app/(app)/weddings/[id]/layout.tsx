import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { WeddingTabs } from "@/components/weddings/wedding-tabs";

export default async function WeddingLayout({ children, params }: { children: ReactNode; params: { id: string } }) {
  const session = await requireSession();
  let wedding;
  try {
    wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) notFound();
    throw e;
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/weddings" className="eyebrow text-ink-soft hover:text-ink">
          ← All weddings
        </Link>
        <h1 className="font-serif text-4xl mt-3">{wedding.coupleName}</h1>
        <p className="font-sans text-sm text-ink-soft mt-1">
          {wedding.venue ?? "Venue TBD"} {wedding.location ? `· ${wedding.location}` : ""}
        </p>
      </div>
      <WeddingTabs weddingId={wedding.id} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
