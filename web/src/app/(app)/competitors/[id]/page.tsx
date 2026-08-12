import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { requireCompetitorInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { analyzeCompetitorPosts } from "@/lib/competitor-analysis";
import { SectionHeading, Stat } from "@/components/ui/stat";
import { CompetitorPostForm } from "@/components/competitors/competitor-post-form";
import { createCompetitorPostAction, deleteCompetitorPostAction, deleteCompetitorAction } from "@/app/actions/competitors";
import { Button } from "@/components/ui/button";

export default async function CompetitorDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  let competitor;
  try {
    competitor = await requireCompetitorInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) notFound();
    throw e;
  }

  const posts = await prisma.competitorPost.findMany({ where: { competitorId: competitor.id }, orderBy: { createdAt: "desc" } });
  const analysis = analyzeCompetitorPosts(posts);
  const storage = getStorageAdapter();
  const boundCreate = createCompetitorPostAction.bind(null, competitor.id);

  return (
    <div className="space-y-14">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow mb-2">
            {competitor.accountType.replace(/_/g, " ")} · {competitor.priority} priority
          </p>
          <h1 className="font-serif text-4xl">{competitor.accountName}</h1>
          {competitor.instagramUrl && (
            <a href={competitor.instagramUrl} target="_blank" rel="noreferrer" className="font-sans text-sm text-ink-soft underline">
              {competitor.instagramUrl}
            </a>
          )}
        </div>
        <form action={deleteCompetitorAction.bind(null, competitor.id)}>
          <Button variant="danger" type="submit">
            Remove account
          </Button>
        </form>
      </div>

      {analysis && (
        <section>
          <SectionHeading eyebrow="Pattern analysis" title="What this account tends to do" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Stat label="Reference posts" value={analysis.sampleSize} />
            <Stat label="Avg caption length" value={analysis.avgCaptionLength ?? "—"} hint="characters" />
            <Stat label="Posting cadence" value={analysis.postingCadenceDays ? `${analysis.postingCadenceDays}d` : "—"} hint="avg days between posts" />
            <Stat label="Top format" value={analysis.topFormats[0]?.value.replace(/_/g, " ") ?? "—"} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 font-sans text-sm">
            <div>
              <p className="eyebrow mb-3">Most common content</p>
              <ol className="space-y-1 list-decimal list-inside">
                {analysis.topCategories.map((c) => (
                  <li key={c.value}>
                    {c.value} <span className="text-ink-soft">({c.count})</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="eyebrow mb-3">Hashtag patterns</p>
              <div className="flex flex-wrap gap-2">
                {analysis.topHashtags.map((h) => (
                  <span key={h.value} className="border border-hairline px-2 py-1 text-xs">
                    {h.value} ({h.count})
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-3">CTA patterns</p>
              <ul className="space-y-1">
                {analysis.topCtas.length === 0 && <li className="text-ink-soft">None recorded.</li>}
                {analysis.topCtas.map((c) => (
                  <li key={c.value}>&ldquo;{c.value}&rdquo;</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-3">Posting days</p>
              <ul className="space-y-1">
                {analysis.dayFrequency.map((d) => (
                  <li key={d.value}>
                    {d.value}: {d.count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section>
        <SectionHeading eyebrow="Reference library" title="Add content manually" />
        <CompetitorPostForm action={boundCreate} />
      </section>

      {posts.length > 0 && (
        <section>
          <SectionHeading eyebrow="Reference library" title={`${posts.length} saved reference${posts.length === 1 ? "" : "s"}`} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.map((p) => (
              <div key={p.id} className="border border-hairline p-5 font-sans text-sm">
                {p.screenshotKey && (
                  <div className="relative aspect-video mb-3 bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={storage.publicUrl(p.screenshotKey)} alt="Reference screenshot" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow">{p.sourceType.replace(/_/g, " ")}</span>
                  <form action={deleteCompetitorPostAction.bind(null, competitor.id, p.id)}>
                    <button className="text-xs text-ink-soft hover:text-reject">Remove</button>
                  </form>
                </div>
                {p.caption && <p className="text-ink-soft italic mb-2">&ldquo;{p.caption.slice(0, 180)}{p.caption.length > 180 ? "…" : ""}&rdquo;</p>}
                <div className="flex flex-wrap gap-1 text-xs text-ink-soft">
                  {p.categories.map((c) => (
                    <span key={c} className="border border-hairline px-2 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
