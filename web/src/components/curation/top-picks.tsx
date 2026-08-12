import Image from "next/image";

export type TopPickData = {
  id: string;
  imageUrl: string;
  rank: number;
  totalScore: number;
  technicalScore: number;
  compositionScore: number;
  editorialScore: number;
  brandFitScore: number;
  verdict: string;
  verdictReason: string;
  categories: string[];
  provider: string;
};

const VERDICT_LABEL: Record<string, string> = {
  KEEP: "Keep",
  MAYBE: "Maybe",
  REJECT: "Reject",
};

/**
 * The photography-first "why each was selected" showcase (§6/§24). The
 * #1 pick gets a full-bleed editorial hero treatment; the rest run in a
 * large-format grid where the photograph — not chrome — carries the page.
 */
export function TopPicks({ picks }: { picks: TopPickData[] }) {
  if (picks.length === 0) return null;
  const [hero, ...rest] = picks;

  return (
    <div className="space-y-10">
      <HeroPick pick={hero} />
      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {rest.map((p) => (
            <PickCard key={p.id} pick={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroPick({ pick }: { pick: TopPickData }) {
  return (
    <div className="relative w-full aspect-[16/9] overflow-hidden bg-paper">
      <Image src={pick.imageUrl} alt="" fill sizes="1400px" className="object-cover" priority />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-10 text-ivory">
        <p className="eyebrow !text-ivory/70 mb-3">Editor&rsquo;s pick No. 1</p>
        <div className="flex items-end gap-6 mb-4">
          <p className="font-serif text-6xl md:text-7xl leading-none">{pick.totalScore.toFixed(1)}</p>
          <p className="font-sans text-sm text-ivory/80 max-w-xl pb-2">{pick.verdictReason}</p>
        </div>
        <ScoreStrip pick={pick} light />
      </div>
    </div>
  );
}

function PickCard({ pick }: { pick: TopPickData }) {
  return (
    <div className="group">
      <div className="relative aspect-[4/5] overflow-hidden bg-paper mb-4">
        <Image src={pick.imageUrl} alt="" fill sizes="450px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute top-3 left-3 font-serif text-lg text-ivory drop-shadow">#{pick.rank}</span>
        <span className="absolute top-3 right-3 font-sans text-[10px] tracking-wide uppercase text-ivory/90 bg-ink/40 px-2 py-1 backdrop-blur-sm">
          {VERDICT_LABEL[pick.verdict] ?? pick.verdict}
        </span>
      </div>
      <p className="font-serif text-2xl mb-1">{pick.totalScore.toFixed(1)}</p>
      <p className="font-sans text-sm text-ink-soft leading-relaxed mb-3">{pick.verdictReason}</p>
      <ScoreStrip pick={pick} />
      {pick.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {pick.categories.slice(0, 3).map((c) => (
            <span key={c} className="font-sans text-[10px] uppercase tracking-wide text-ink-soft border border-hairline px-2 py-0.5">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreStrip({ pick, light = false }: { pick: TopPickData; light?: boolean }) {
  const tone = light ? "text-ivory/80" : "text-ink-soft";
  const dim = light ? "text-ivory/50" : "text-ink-soft/60";
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-1 font-sans text-xs ${tone}`}>
      <span>
        Technical <span className={dim}>{pick.technicalScore.toFixed(1)}</span>
      </span>
      <span>
        Composition <span className={dim}>{pick.compositionScore.toFixed(1)}</span>
      </span>
      <span>
        Editorial <span className={dim}>{pick.editorialScore.toFixed(1)}</span>
      </span>
      <span>
        Brand fit <span className={dim}>{pick.brandFitScore.toFixed(1)}</span>
      </span>
    </div>
  );
}
