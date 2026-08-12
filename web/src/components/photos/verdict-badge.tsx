const STYLES: Record<string, string> = {
  KEEP: "bg-keep/10 text-keep border-keep/40",
  MAYBE: "bg-maybe/10 text-maybe border-maybe/40",
  REJECT: "bg-reject/10 text-reject border-reject/40",
  PENDING: "bg-transparent text-ink-soft border-hairline",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={`eyebrow !tracking-[0.1em] border px-2 py-1 ${STYLES[verdict] ?? STYLES.PENDING}`}>
      {verdict}
    </span>
  );
}
