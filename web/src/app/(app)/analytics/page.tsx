import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading, Stat } from "@/components/ui/stat";
import { summarizeAnalytics } from "@/lib/analytics";
import { LogAnalyticsForm } from "@/components/analytics/log-analytics-form";

export default async function AnalyticsPage() {
  const session = await requireSession();

  const [rows, allPosts] = await Promise.all([
    prisma.analytics.findMany({
      where: { organizationId: session.user.organizationId },
      include: {
        contentPost: { include: { wedding: true, images: { include: { photo: true } } } },
      },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.contentPost.findMany({
      where: { wedding: { organizationId: session.user.organizationId } },
      include: { wedding: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const summary = summarizeAnalytics(rows);
  const postOptions = allPosts.map((p) => ({ id: p.id, label: `${p.wedding.coupleName} — ${p.title ?? "Untitled"}` }));

  return (
    <div className="space-y-14">
      <SectionHeading eyebrow="Analytics" title={rows.length === 0 ? "No performance data yet" : `${rows.length} logged post${rows.length === 1 ? "" : "s"}`} />
      {rows.length === 0 && (
        <p className="font-sans text-sm text-ink-soft -mt-8 max-w-2xl">
          No Instagram/Meta API is connected in this MVP, so this page is empty until performance is logged manually
          below, or a platform integration is added. We won&rsquo;t show simulated numbers.
        </p>
      )}

      <LogAnalyticsForm posts={postOptions} />

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Reach" value={summary.totals.reach} />
            <Stat label="Likes" value={summary.totals.likes} />
            <Stat label="Comments" value={summary.totals.comments} />
            <Stat label="Saves" value={summary.totals.saves} />
            <Stat label="Shares" value={summary.totals.shares} />
            <Stat label="Profile visits" value={summary.totals.profileVisits} />
            <Stat label="Followers gained" value={summary.totals.followersGained} />
            <Stat label="Avg engagement rate" value={summary.totals.avgEngagementRate != null ? `${summary.totals.avgEngagementRate}%` : "—"} />
          </div>

          {summary.patterns.length > 0 && (
            <section>
              <p className="eyebrow mb-3">Patterns & recommendations</p>
              <ul className="font-sans text-sm space-y-2">
                {summary.patterns.map((p, i) => (
                  <li key={i} className="border-l-2 border-gold pl-4">
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section>
              <p className="eyebrow mb-3">Best performing</p>
              <ul className="font-sans text-sm space-y-2">
                {summary.best.map((r, i) => (
                  <li key={i}>
                    {r.contentPost?.wedding.coupleName} — {r.engagementRate}% engagement
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <p className="eyebrow mb-3">Worst performing</p>
              <ul className="font-sans text-sm space-y-2">
                {summary.worst.map((r, i) => (
                  <li key={i}>
                    {r.contentPost?.wedding.coupleName} — {r.engagementRate}% engagement
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 font-sans text-sm">
            <BreakdownList title="By format" rows={summary.formatBreakdown} />
            <BreakdownList title="By caption tone" rows={summary.toneBreakdown} />
            <BreakdownList title="By wedding" rows={summary.weddingBreakdown} />
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: { key: string; sampleSize: number; avgEngagementRate: number | null }[] }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between">
            <span>{r.key.replace(/_/g, " ")}</span>
            <span className="text-ink-soft">{r.avgEngagementRate != null ? `${r.avgEngagementRate.toFixed(1)}%` : "—"} ({r.sampleSize})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
