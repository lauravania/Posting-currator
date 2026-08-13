import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { PhotoCard, type PhotoCardData } from "@/components/photos/photo-card";
import { RunCurationButton } from "@/components/photos/run-curation-button";
import { TopPicks, type TopPickData } from "@/components/curation/top-picks";
import { isDemoMode, VERDICT_DISPLAY_LABEL, type CurationVerdict } from "@/lib/ai";

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

  const topPicks: TopPickData[] = top10.map((p, i) => ({
    id: p.id,
    imageUrl: storage.publicUrl(p.thumbnailKey ?? p.storageKey),
    rank: i + 1,
    totalScore: p.analysis!.totalScore,
    technicalScore: p.analysis!.technicalScore,
    compositionScore: p.analysis!.compositionScore,
    editorialScore: p.analysis!.editorialScore,
    brandFitScore: p.analysis!.brandFitScore,
    verdict: p.analysis!.verdict,
    verdictReason: p.analysis!.verdictReason ?? "",
    categories: p.categories,
    provider: p.analysis!.provider,
  }));

  return (
    <div className="space-y-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="eyebrow mb-2">AI Curation</p>
          <h1 className="font-serif text-3xl">
            {analyzed.length > 0 ? "The edit" : "Nothing curated yet"}
          </h1>
          {analyzed.length > 0 && (
            <p className="font-sans text-sm text-ink-soft mt-2">
              {keep.length} keeper{keep.length === 1 ? "" : "s"} · {maybe.length} maybe{maybe.length === 1 ? "" : "s"} ·{" "}
              {reject.length} skipped
              {isDemoMode() && " · Demo Mode"}
            </p>
          )}
        </div>
        <RunCurationButton weddingId={wedding.id} pendingCount={pendingCount} />
      </div>

      {isDemoMode() && (
        <p className="font-sans text-xs text-ink-soft -mt-10">
          Demo Mode: technical and composition scores are computed from the real image pixels. Emotional/editorial
          scoring and object/people detection require a connected OPENAI_API_KEY to reflect genuine semantic
          understanding — until then, editorial scores are a conservative estimate.
        </p>
      )}

      {topPicks.length > 0 && (
        <section>
          <p className="eyebrow mb-6">Top 10 — why each was selected</p>
          <TopPicks picks={topPicks} />
        </section>
      )}

      {(["KEEP", "MAYBE", "REJECT"] as CurationVerdict[]).map((verdict) => {
        const group = verdict === "KEEP" ? keep : verdict === "MAYBE" ? maybe : reject;
        if (group.length === 0) return null;
        return (
          <section key={verdict}>
            <p className="eyebrow mb-6">
              {VERDICT_DISPLAY_LABEL[verdict]} board ({group.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
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
