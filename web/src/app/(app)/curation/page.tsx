import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading, Stat } from "@/components/ui/stat";
import { isDemoMode } from "@/lib/ai";

export default async function CurationOverviewPage() {
  const session = await requireSession();
  const storage = getStorageAdapter();
  const organizationId = session.user.organizationId;

  const [weddingsWithPending, topKeepers, totals] = await Promise.all([
    prisma.wedding.findMany({
      where: { organizationId, photos: { some: { analysis: null } } },
      include: { _count: { select: { photos: { where: { analysis: null } } } } },
    }),
    prisma.photo.findMany({
      where: { wedding: { organizationId }, analysis: { verdict: "KEEP" } },
      orderBy: { analysis: { totalScore: "desc" } },
      take: 12,
      include: { analysis: true, wedding: true },
    }),
    prisma.photoAnalysis.groupBy({
      by: ["verdict"],
      where: { photo: { wedding: { organizationId } } },
      _count: true,
    }),
  ]);

  const counts = Object.fromEntries(totals.map((t) => [t.verdict, t._count])) as Record<string, number>;

  return (
    <div className="space-y-14">
      <SectionHeading eyebrow="AI Curation" title="Curation queue" />
      {isDemoMode() && (
        <p className="font-sans text-xs text-ink-soft border border-hairline px-4 py-3 -mt-8">
          Running in Demo Mode — heuristic, pixel-based scoring. Add OPENAI_API_KEY for live vision-model scoring.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Keep" value={counts.KEEP ?? 0} />
        <Stat label="Maybe" value={counts.MAYBE ?? 0} />
        <Stat label="Reject" value={counts.REJECT ?? 0} />
        <Stat label="Weddings with pending analysis" value={weddingsWithPending.length} />
      </div>

      {weddingsWithPending.length > 0 && (
        <section>
          <SectionHeading eyebrow="Needs attention" title="Awaiting analysis" />
          <div className="divide-y divide-hairline border-t border-b border-hairline font-sans text-sm">
            {weddingsWithPending.map((w) => (
              <Link key={w.id} href={`/weddings/${w.id}/curation`} className="flex items-center justify-between py-4 hover:bg-paper/60 px-2">
                <p className="font-serif text-lg">{w.coupleName}</p>
                <span className="eyebrow">{w._count.photos} pending</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topKeepers.length > 0 && (
        <section>
          <SectionHeading eyebrow="Best of the library" title="Top curated keepers" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {topKeepers.map((p) => (
              <Link key={p.id} href={`/weddings/${p.weddingId}/curation`} className="block border border-hairline">
                <div className="relative aspect-[4/5] bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={storage.publicUrl(p.thumbnailKey ?? p.storageKey)}
                    alt={p.originalFilename}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2 font-sans text-xs">
                  <p className="font-serif text-base">{p.analysis?.totalScore.toFixed(1)}</p>
                  <p className="text-ink-soft">{p.wedding.coupleName}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
