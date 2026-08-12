import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";

export default async function CompetitorsPage() {
  const session = await requireSession();
  const competitors = await prisma.competitor.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { posts: true } } },
  });

  return (
    <div>
      <SectionHeading
        eyebrow="Reference, not a template"
        title="Competitor Intelligence"
        action={
          <Link href="/competitors/new">
            <Button>Add account</Button>
          </Link>
        }
      />
      <p className="font-sans text-sm text-ink-soft -mt-4 mb-10 max-w-2xl">
        Reference content here is manually added — screenshots, URLs, or notes you provide. We never scrape or
        auto-fetch. This informs visual/structural trends only; every caption we generate is original to your brand.
      </p>

      {competitors.length === 0 ? (
        <p className="font-sans text-sm text-ink-soft">
          No reference accounts yet. Add a competitor or peer account to start tracking market patterns.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {competitors.map((c) => (
            <Link key={c.id} href={`/competitors/${c.id}`} className="block border border-hairline p-6 hover:border-gold transition-colors">
              <p className="eyebrow mb-2">{c.accountType.replace(/_/g, " ")} · {c.priority}</p>
              <p className="font-serif text-xl mb-1">{c.accountName}</p>
              <p className="font-sans text-xs text-ink-soft">{c._count.posts} reference post{c._count.posts === 1 ? "" : "s"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
