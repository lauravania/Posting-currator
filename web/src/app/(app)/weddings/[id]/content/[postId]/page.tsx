import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { requireContentPostInOrg, NotFoundOrForbiddenError, requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading, Stat } from "@/components/ui/stat";
import { PostEditorForm } from "@/components/content/post-editor-form";
import { RegenerateCaptionForm } from "@/components/content/regenerate-caption-form";
import { updatePostAction, regenerateCaptionAction, deletePostAction } from "@/app/actions/content";
import { Button } from "@/components/ui/button";

export default async function PostEditorPage({ params }: { params: { id: string; postId: string } }) {
  const session = await requireSession();
  await requireWeddingInOrg(params.id, session.user.organizationId);

  let post;
  try {
    post = await requireContentPostInOrg(params.postId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) notFound();
    throw e;
  }

  const vendors = await prisma.vendor.findMany({ where: { weddingId: params.id } });
  const storage = getStorageAdapter();

  const boundUpdate = updatePostAction.bind(null, post.id);
  const boundRegenerate = regenerateCaptionAction.bind(null, post.id);

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between">
        <SectionHeading eyebrow="Content Studio" title={post.title ?? "Untitled post"} />
        <form action={deletePostAction.bind(null, params.id, post.id)}>
          <Button variant="danger" type="submit">
            Delete
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {post.images
          .sort((a, b) => a.order - b.order)
          .map((img) => (
            <div key={img.id} className="relative aspect-[4/5] bg-paper border border-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={storage.publicUrl(img.photo.thumbnailKey ?? img.photo.storageKey)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Format" value={post.format.replace(/_/g, " ")} />
        <Stat label="Recommended time" value={post.recommendedTime ?? "—"} />
        <Stat label="Confidence" value={post.timeConfidence ? `${Math.round(post.timeConfidence * 100)}%` : "—"} />
        <Stat label="Status" value={post.status.replace(/_/g, " ")} />
      </div>
      {post.timeReason && <p className="font-sans text-xs text-ink-soft -mt-4">{post.timeReason}</p>}

      <RegenerateCaptionForm action={boundRegenerate} currentTone={post.tone} />

      <PostEditorForm
        action={boundUpdate}
        vendors={vendors}
        defaults={{
          title: post.title ?? "",
          hook: post.hook ?? "",
          caption: post.caption ?? "",
          shortCaption: post.shortCaption ?? "",
          cta: post.cta ?? "",
          hashtags: post.hashtags,
          status: post.status,
          scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString().slice(0, 16) : "",
          recommendedTime: post.recommendedTime ?? "",
          collaborators: post.collaborators,
        }}
      />

      {post.seoKeywords.length > 0 && (
        <div>
          <p className="eyebrow mb-2">SEO keywords</p>
          <p className="font-sans text-sm text-ink-soft">{post.seoKeywords.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
