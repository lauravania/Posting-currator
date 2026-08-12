import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/stat";
import { QuickStatusForm } from "@/components/content/quick-status-form";
import { setPostStatusAction } from "@/app/actions/content";

export default async function ContentCalendarPage() {
  const session = await requireSession();
  const storage = getStorageAdapter();

  const posts = await prisma.contentPost.findMany({
    where: { wedding: { organizationId: session.user.organizationId } },
    orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
    include: { wedding: true, images: { include: { photo: true }, orderBy: { order: "asc" }, take: 1 } },
  });

  const scheduled = posts.filter((p) => p.scheduledFor);
  const unscheduled = posts.filter((p) => !p.scheduledFor);

  return (
    <div className="space-y-14">
      <SectionHeading eyebrow="Content Calendar" title={`${posts.length} post${posts.length === 1 ? "" : "s"} in the pipeline`} />

      {scheduled.length > 0 && (
        <section>
          <p className="eyebrow mb-4">Scheduled</p>
          <PostTable posts={scheduled} storage={storage} showDate />
        </section>
      )}

      <section>
        <p className="eyebrow mb-4">Not yet scheduled</p>
        {unscheduled.length === 0 ? (
          <p className="font-sans text-sm text-ink-soft">Nothing waiting on a schedule.</p>
        ) : (
          <PostTable posts={unscheduled} storage={storage} showDate={false} />
        )}
      </section>
    </div>
  );
}

function PostTable({
  posts,
  storage,
  showDate,
}: {
  posts: Awaited<ReturnType<typeof prisma.contentPost.findMany<{
    include: { wedding: true; images: { include: { photo: true }; orderBy: { order: "asc" }; take: 1 } };
  }>>>;
  storage: ReturnType<typeof getStorageAdapter>;
  showDate: boolean;
}) {
  return (
    <div className="divide-y divide-hairline border-t border-b border-hairline font-sans text-sm">
      {posts.map((p) => {
        const thumb = p.images[0]?.photo;
        return (
          <Link
            key={p.id}
            href={`/weddings/${p.weddingId}/content/${p.id}`}
            className="flex items-center gap-4 py-4 px-2 hover:bg-paper/60"
          >
            <div className="relative w-14 h-16 shrink-0 bg-paper border border-hairline">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={storage.publicUrl(thumb.thumbnailKey ?? thumb.storageKey)} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-serif text-lg truncate">{p.title ?? "Untitled"}</p>
              <p className="text-ink-soft text-xs">
                {p.wedding.coupleName} · {p.format.replace(/_/g, " ")}
                {showDate && p.scheduledFor ? ` · ${new Date(p.scheduledFor).toLocaleString()}` : ""}
                {!showDate && p.recommendedTime ? ` · suggested ${p.recommendedTime}` : ""}
              </p>
            </div>
            <QuickStatusForm action={setPostStatusAction.bind(null, p.id)} currentStatus={p.status} />
          </Link>
        );
      })}
    </div>
  );
}
