import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/stat";
import { UploadDropzone } from "@/components/photos/upload-dropzone";
import { PhotoCard, type PhotoCardData } from "@/components/photos/photo-card";
import { RunCurationButton } from "@/components/photos/run-curation-button";

export default async function WeddingPhotosPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const storage = getStorageAdapter();

  const photos = await prisma.photo.findMany({
    where: { weddingId: wedding.id },
    orderBy: { uploadedAt: "desc" },
    include: { analysis: true },
  });

  const pendingCount = photos.filter((p) => !p.analysis).length;

  const cards: PhotoCardData[] = photos.map((p) => ({
    id: p.id,
    thumbnailUrl: storage.publicUrl(p.thumbnailKey ?? p.storageKey),
    originalFilename: p.originalFilename,
    categories: p.categories,
    suggestedContentType: p.suggestedContentType,
    analysis: p.analysis
      ? {
          totalScore: p.analysis.totalScore,
          technicalScore: p.analysis.technicalScore,
          compositionScore: p.analysis.compositionScore,
          editorialScore: p.analysis.editorialScore,
          brandFitScore: p.analysis.brandFitScore,
          verdict: p.analysis.verdict,
          verdictReason: p.analysis.verdictReason ?? "",
          provider: p.analysis.provider,
        }
      : null,
  }));

  return (
    <div className="space-y-10">
      <SectionHeading eyebrow="Photo Library" title={`${photos.length} photograph${photos.length === 1 ? "" : "s"}`} />
      <UploadDropzone weddingId={wedding.id} />
      <RunCurationButton weddingId={wedding.id} pendingCount={pendingCount} />

      {cards.length === 0 ? (
        <p className="font-sans text-sm text-ink-soft">No photos uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <PhotoCard key={c.id} photo={c} />
          ))}
        </div>
      )}
    </div>
  );
}
