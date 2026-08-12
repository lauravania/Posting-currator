import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/stat";
import { PhotoCard, type PhotoCardData } from "@/components/photos/photo-card";
import { RunCurationButton } from "@/components/photos/run-curation-button";
import { isDemoMode } from "@/lib/ai";

export default async function WeddingCurationPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const storage = getStorageAdapter();

  const photos = await prisma.photo.findMany({
    where: { weddingId: wedding.id },
    include: { analysis: true },
  });

  const pendingCount = photos.filter((p) => !p.analysis).length;
  const analyzed = photos.filter((p) => p.analysis).sort((a, b) => (b.analysis!.totalScore ?? 0) - (a.analysis!.totalScore ?? 0));

  const toCard = (p: (typeof photos)[number]): PhotoCardData => ({
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
  });

  const top10 = analyzed.slice(0, 10);
  const keep = analyzed.filter((p) => p.analysis!.verdict === "KEEP");
  const maybe = analyzed.filter((p) => p.analysis!.verdict === "MAYBE");
  const reject = analyzed.filter((p) => p.analysis!.verdict === "REJECT");

  return (
    <div className="space-y-14">
      <div className="flex items-start justify-between">
        <SectionHeading
          eyebrow="AI Curation"
          title={analyzed.length > 0 ? `${keep.length} keepers · ${maybe.length} maybes · ${reject.length} rejected` : "No analysis yet"}
        />
      </div>

      {isDemoMode() && (
        <p className="font-sans text-xs text-ink-soft border border-hairline px-4 py-3 -mt-8">
          Demo Mode: technical and composition scores are computed from the real image pixels. Emotional/editorial
          scoring and object/people detection require a connected OPENAI_API_KEY to reflect genuine semantic
          understanding — until then, editorial scores are a conservative estimate.
        </p>
      )}

      <RunCurationButton weddingId={wedding.id} pendingCount={pendingCount} />

      {top10.length > 0 && (
        <section>
          <SectionHeading eyebrow="Selection" title="Top 10 — why each was selected" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {top10.map((p) => (
              <PhotoCard key={p.id} photo={toCard(p)} />
            ))}
          </div>
        </section>
      )}

      {(["KEEP", "MAYBE", "REJECT"] as const).map((verdict) => {
        const group = verdict === "KEEP" ? keep : verdict === "MAYBE" ? maybe : reject;
        if (group.length === 0) return null;
        return (
          <section key={verdict}>
            <SectionHeading eyebrow="Curation board" title={`${verdict[0]}${verdict.slice(1).toLowerCase()} (${group.length})`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {group.map((p) => (
                <PhotoCard key={p.id} photo={toCard(p)} />
              ))}
            </div>
          </section>
        );
      })}

      {analyzed.length === 0 && pendingCount === 0 && (
        <p className="font-sans text-sm text-ink-soft">Upload photos from the Photo Library tab first.</p>
      )}
    </div>
  );
}
