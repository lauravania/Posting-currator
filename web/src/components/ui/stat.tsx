export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border border-hairline px-6 py-5">
      <p className="eyebrow mb-2">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
      {hint && <p className="font-sans text-xs text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="font-serif text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
