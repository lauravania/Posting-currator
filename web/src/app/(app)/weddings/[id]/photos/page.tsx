import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { isCloudProviderConfigured, isLinkImportAvailable } from "@/lib/cloud";
import { SectionHeading } from "@/components/ui/stat";
import { AddPhotosTabs } from "@/components/photos/add-photos-tabs";
import { PhotoCard, type PhotoCardData } from "@/components/photos/photo-card";
import { RunCurationButton } from "@/components/photos/run-curation-button";

export default async function WeddingPhotosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { cloudError?: string; cloudConnected?: string };
}) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const storage = getStorageAdapter();

  const [photos, connections] = await Promise.all([
    prisma.photo.findMany({
      where: { weddingId: wedding.id },
      orderBy: { uploadedAt: "desc" },
      include: { analysis: true },
    }),
    prisma.cloudConnection.findMany({ where: { organizationId: session.user.organizationId } }),
  ]);

  const byProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));
  const googleDriveStatus = {
    configured: isCloudProviderConfigured("GOOGLE_DRIVE"),
    connected: Boolean(byProvider.GOOGLE_DRIVE),
    accountLabel: byProvider.GOOGLE_DRIVE?.accountLabel ?? null,
    linkImportAvailable: isLinkImportAvailable("GOOGLE_DRIVE"),
  };
  const dropboxStatus = {
    configured: isCloudProviderConfigured("DROPBOX"),
    connected: Boolean(byProvider.DROPBOX),
    accountLabel: byProvider.DROPBOX?.accountLabel ?? null,
    linkImportAvailable: isLinkImportAvailable("DROPBOX"),
  };

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

      {searchParams.cloudConnected && (
        <p className="font-sans text-xs text-keep border border-keep/40 px-4 py-3 -mt-6">
          Connected to {searchParams.cloudConnected}.
        </p>
      )}
      {searchParams.cloudError && (
        <p className="font-sans text-xs text-reject border border-reject/40 px-4 py-3 -mt-6">{searchParams.cloudError}</p>
      )}

      <AddPhotosTabs weddingId={wedding.id} googleDriveStatus={googleDriveStatus} dropboxStatus={dropboxStatus} />

      <RunCurationButton weddingId={wedding.id} pendingCount={pendingCount} />

      {cards.length === 0 ? (
        <p className="font-sans text-sm text-ink-soft">No photos imported yet.</p>
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
