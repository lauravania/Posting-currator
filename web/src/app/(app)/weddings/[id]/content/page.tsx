import Link from "next/link";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { NewPostForm } from "@/components/content/new-post-form";
import { detectOpportunitiesAction, createPostFromIdeaAction, createManualPostAction } from "@/app/actions/content";

export default async function WeddingContentPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const storage = getStorageAdapter();

  const [ideas, posts, keeperPhotos] = await Promise.all([
    prisma.contentIdea.findMany({ where: { weddingId: wedding.id }, orderBy: { createdAt: "desc" } }),
    prisma.contentPost.findMany({ where: { weddingId: wedding.id }, orderBy: { updatedAt: "desc" } }),
    prisma.photo.findMany({
      where: { weddingId: wedding.id, analysis: { verdict: { in: ["KEEP", "MAYBE"] } } },
      include: { analysis: true },
      orderBy: { analysis: { totalScore: "desc" } },
    }),
  ]);

  const pickablePhotos = keeperPhotos.map((p) => ({
    id: p.id,
    thumbnailUrl: storage.publicUrl(p.thumbnailKey ?? p.storageKey),
    totalScore: p.analysis?.totalScore ?? null,
    verdict: p.analysis?.verdict ?? null,
  }));

  const boundManualCreate = createManualPostAction.bind(null, wedding.id);
  const boundDetect = detectOpportunitiesAction.bind(null, wedding.id);

  return (
    <div className="space-y-14">
      <div className="flex items-start justify-between">
        <SectionHeading eyebrow="Content Studio" title="Opportunities & drafts" />
        <form action={boundDetect}>
          <Button variant="secondary" type="submit">
            Detect content opportunities
          </Button>
        </form>
      </div>

      {ideas.length > 0 && (
        <section>
          <p className="eyebrow mb-4">Suggested by the Content Opportunity Engine</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ideas.map((idea) => (
              <div key={idea.id} className="border border-hairline p-6">
                <p className="eyebrow mb-2">{idea.format.replace(/_/g, " ")} · {idea.photoIds.length} photos</p>
                <p className="font-serif text-xl mb-2">{idea.title}</p>
                <p className="font-sans text-sm text-ink-soft mb-2">{idea.concept}</p>
                {idea.hook && <p className="font-sans text-sm italic mb-3">&ldquo;{idea.hook}&rdquo;</p>}
                {idea.rationale && <p className="font-sans text-xs text-ink-soft mb-4">{idea.rationale}</p>}
                <form action={createPostFromIdeaAction.bind(null, wedding.id, idea.id)}>
                  <Button type="submit" variant="secondary">
                    Create draft post
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="eyebrow mb-4">Build a post manually</p>
        {pickablePhotos.length === 0 ? (
          <p className="font-sans text-sm text-ink-soft">Curate some KEEP photos first — see the AI Curation tab.</p>
        ) : (
          <NewPostForm action={boundManualCreate} photos={pickablePhotos} />
        )}
      </section>

      {posts.length > 0 && (
        <section>
          <p className="eyebrow mb-4">Drafts & posts</p>
          <div className="divide-y divide-hairline border-t border-b border-hairline font-sans text-sm">
            {posts.map((p) => (
              <Link key={p.id} href={`/weddings/${wedding.id}/content/${p.id}`} className="flex items-center justify-between py-4 hover:bg-paper/60 px-2">
                <div>
                  <p className="font-serif text-lg">{p.title ?? "Untitled"}</p>
                  <p className="text-ink-soft text-xs">{p.format.replace(/_/g, " ")}</p>
                </div>
                <span className="eyebrow">{p.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
