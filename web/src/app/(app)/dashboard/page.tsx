import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Stat, SectionHeading } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/ai";

export default async function DashboardPage() {
  const session = await requireSession();
  const organizationId = session.user.organizationId;

  const [weddingCount, photoCount, pendingAnalysis, keepCount, weddings, recentPosts] = await Promise.all([
    prisma.wedding.count({ where: { organizationId } }),
    prisma.photo.count({ where: { wedding: { organizationId } } }),
    prisma.photo.count({ where: { wedding: { organizationId }, analysis: null } }),
    prisma.photoAnalysis.count({ where: { verdict: "KEEP", photo: { wedding: { organizationId } } } }),
    prisma.wedding.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { photos: true } } },
    }),
    prisma.contentPost.findMany({
      where: { wedding: { organizationId } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { wedding: true },
    }),
  ]);

  return (
    <div className="space-y-14">
      <div>
        <p className="eyebrow mb-3">{isDemoMode() ? "Demo Mode — heuristic AI, no API key configured" : "Live AI"}</p>
        <h1 className="font-serif text-4xl mb-2">Good to see you, {session.user.name?.split(" ")[0] ?? "there"}.</h1>
        <p className="font-sans text-ink-soft max-w-2xl">
          Your creative direction, curated. Here&rsquo;s where {session.user.organizationName} stands today.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Weddings" value={weddingCount} />
        <Stat label="Photos in library" value={photoCount} />
        <Stat label="Awaiting AI analysis" value={pendingAnalysis} />
        <Stat label="Curated keepers" value={keepCount} />
      </div>

      <section>
        <SectionHeading
          eyebrow="Workspace"
          title="Recent weddings"
          action={
            <Link href="/weddings/new">
              <Button variant="secondary">New wedding</Button>
            </Link>
          }
        />
        {weddings.length === 0 ? (
          <EmptyState
            title="No weddings yet"
            body="Create your first wedding project to start uploading photos and generating content."
            ctaHref="/weddings/new"
            ctaLabel="Create a wedding"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {weddings.map((w) => (
              <Link
                key={w.id}
                href={`/weddings/${w.id}`}
                className="block border border-hairline p-6 hover:border-gold transition-colors"
              >
                <p className="eyebrow mb-2">{w.location ?? "Location TBD"}</p>
                <p className="font-serif text-xl mb-1">{w.coupleName}</p>
                <p className="font-sans text-sm text-ink-soft">{w._count.photos} photos</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading eyebrow="Content" title="Recently updated posts" />
        {recentPosts.length === 0 ? (
          <EmptyState
            title="No content drafted yet"
            body="Once you curate photos for a wedding, generate your first post concept from Content Studio."
            ctaHref="/content-studio"
            ctaLabel="Go to Content Studio"
          />
        ) : (
          <div className="divide-y divide-hairline border-t border-b border-hairline">
            {recentPosts.map((p) => (
              <Link
                key={p.id}
                href={`/weddings/${p.weddingId}/content/${p.id}`}
                className="flex items-center justify-between py-4 hover:bg-paper/60 px-2 transition-colors"
              >
                <div>
                  <p className="font-serif text-lg">{p.title ?? "Untitled concept"}</p>
                  <p className="font-sans text-xs text-ink-soft">{p.wedding.coupleName}</p>
                </div>
                <span className="eyebrow">{p.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="border border-dashed border-hairline px-8 py-14 text-center">
      <p className="font-serif text-xl mb-2">{title}</p>
      <p className="font-sans text-sm text-ink-soft max-w-md mx-auto mb-6">{body}</p>
      <Link href={ctaHref}>
        <Button variant="secondary">{ctaLabel}</Button>
      </Link>
    </div>
  );
}
