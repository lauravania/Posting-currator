"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { VerdictBadge } from "./verdict-badge";

export type PhotoCardData = {
  id: string;
  thumbnailUrl: string;
  originalFilename: string;
  categories: string[];
  suggestedContentType: string | null;
  analysis: {
    totalScore: number;
    technicalScore: number;
    compositionScore: number;
    editorialScore: number;
    brandFitScore: number;
    verdict: string;
    verdictReason: string;
    provider: string;
  } | null;
};

async function callApi(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

export function PhotoCard({ photo, selectable, selected, onToggleSelect }: {
  photo: PhotoCardData;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      await callApi(`/api/photos/${photo.id}/analyze`, { method: "POST" });
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function overrideVerdict(verdict: "KEEP" | "MAYBE" | "REJECT") {
    setBusy(true);
    try {
      await callApi(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this photo?")) return;
    setBusy(true);
    try {
      await callApi(`/api/photos/${photo.id}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`group relative border ${selected ? "border-gold" : "border-hairline"} bg-paper/30`}>
      <div className="relative aspect-[4/5] overflow-hidden bg-paper cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <Image src={photo.thumbnailUrl} alt={photo.originalFilename} fill sizes="300px" className="object-cover" />
        {selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(photo.id);
            }}
            className={`absolute top-2 left-2 w-5 h-5 border ${selected ? "bg-gold border-gold" : "bg-ivory/80 border-hairline"}`}
          />
        )}
        {photo.analysis && (
          <div className="absolute top-2 right-2">
            <VerdictBadge verdict={photo.analysis.verdict} />
          </div>
        )}
      </div>

      <div className="p-3 font-sans">
        {photo.analysis ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="font-serif text-lg">{photo.analysis.totalScore.toFixed(1)}</p>
              <p className="text-[10px] text-ink-soft uppercase tracking-wide">{photo.analysis.provider}</p>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {photo.categories.slice(0, 2).map((c) => (
                <span key={c} className="text-[10px] border border-hairline px-1.5 py-0.5 text-ink-soft">
                  {c}
                </span>
              ))}
            </div>
            {expanded && (
              <div className="text-xs text-ink-soft space-y-1 mb-2">
                <p>Technical {photo.analysis.technicalScore.toFixed(1)} · Composition {photo.analysis.compositionScore.toFixed(1)}</p>
                <p>Editorial {photo.analysis.editorialScore.toFixed(1)} · Brand fit {photo.analysis.brandFitScore.toFixed(1)}</p>
                <p className="italic">{photo.analysis.verdictReason}</p>
                {photo.suggestedContentType && <p>Suggested: {photo.suggestedContentType}</p>}
              </div>
            )}
            <div className="flex gap-1">
              {(["KEEP", "MAYBE", "REJECT"] as const).map((v) => (
                <button
                  key={v}
                  disabled={busy}
                  onClick={() => overrideVerdict(v)}
                  className={`text-[10px] px-2 py-1 border flex-1 ${
                    photo.analysis?.verdict === v ? "border-ink bg-ink text-ivory" : "border-hairline text-ink-soft hover:text-ink"
                  }`}
                >
                  {v[0]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            onClick={analyze}
            disabled={busy}
            className="w-full text-xs eyebrow py-2 border border-hairline hover:border-gold"
          >
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        )}
        <button onClick={remove} disabled={busy} className="mt-2 text-[10px] text-ink-soft hover:text-reject w-full text-right">
          Delete
        </button>
      </div>
    </div>
  );
}
