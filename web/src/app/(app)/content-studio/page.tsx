import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { isDemoMode } from "@/lib/ai";

export default async function ContentStudioOverviewPage() {
  const session = await requireSession();
  const organizationId = session.user.organizationId;

  const weddings = await prisma.wedding.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contentPosts: true, contentIdeas: true } },
      photos: { where: { analysis: { verdict: "KEEP" } }, select: { id: true } },
    },
  });

  return (
    <div className="space-y-10">
      <SectionHeading eyebrow="Content Studio" title="Choose a wedding to work on" />
      <p className="font-sans text-sm text-ink-soft -mt-6 max-w-2xl">
        {isDemoMode()
          ? "Demo Mode: captions are generated with brand-aware rules and templates. Add OPENAI_API_KEY for live generative copywriting."
          : "Live AI copywriting is active."}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {weddings.map((w) => (
          <Link key={w.id} href={`/weddings/${w.id}/content`} className="block border border-hairline p-6 hover:border-gold transition-colors">
            <p className="eyebrow mb-2">{w.location ?? "Location TBD"}</p>
            <p className="font-serif text-xl mb-1">{w.coupleName}</p>
            <p className="font-sans text-xs text-ink-soft">
              {w.photos.length} keepers · {w._count.contentIdeas} ideas · {w._count.contentPosts} posts
            </p>
          </Link>
        ))}
      </div>
      {weddings.length === 0 && <p className="font-sans text-sm text-ink-soft">Create a wedding first.</p>}
    </div>
  );
}
