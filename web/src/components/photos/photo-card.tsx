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
    <div className="group relative">
      <div
        className={`relative aspect-[4/5] overflow-hidden bg-paper cursor-pointer border ${selected ? "border-gold" : "border-transparent"}`}
        onClick={() => setExpanded((e) => !e)}
      >
        <Image
          src={photo.thumbnailUrl}
          alt={photo.originalFilename}
          fill
          sizes="320px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />

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
          <>
            <div className="absolute top-2 right-2">
              <VerdictBadge verdict={photo.analysis.verdict} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/70 to-transparent pt-8 pb-2 px-2.5">
              <p className="font-serif text-xl text-ivory">{photo.analysis.totalScore.toFixed(1)}</p>
            </div>
          </>
        )}

        {/* Hover/tap-revealed action bar — kept out of the default layout so
            the photograph itself is what the grid reads as. */}
        {photo.analysis && (
          <div
            className={`absolute inset-x-0 bottom-0 bg-ink/85 backdrop-blur-sm px-2.5 py-2 flex gap-1 transition-opacity ${
              expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {(["KEEP", "MAYBE", "REJECT"] as const).map((v) => (
              <button
                key={v}
                disabled={busy}
                onClick={() => overrideVerdict(v)}
                className={`text-[10px] tracking-wide px-2 py-1 border flex-1 ${
                  photo.analysis?.verdict === v
                    ? "border-ivory bg-ivory text-ink"
                    : "border-ivory/40 text-ivory/80 hover:border-ivory"
                }`}
              >
                {v[0]}
              </button>
            ))}
            <button onClick={remove} disabled={busy} className="text-[10px] text-ivory/70 hover:text-reject px-2">
              Del
            </button>
          </div>
        )}

        {!photo.analysis && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              analyze();
            }}
            disabled={busy}
            className="absolute inset-x-2 bottom-2 text-xs eyebrow !text-ivory py-2 bg-ink/70 hover:bg-ink"
          >
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        )}
      </div>

      <div className="pt-2.5 font-sans">
        <div className="flex flex-wrap gap-1 mb-1">
          {photo.categories.slice(0, 2).map((c) => (
            <span key={c} className="text-[10px] text-ink-soft">
              {c}
            </span>
          ))}
        </div>
        {expanded && photo.analysis && (
          <div className="text-xs text-ink-soft space-y-1 mt-1 mb-1">
            <p>
              Technical {photo.analysis.technicalScore.toFixed(1)} · Composition {photo.analysis.compositionScore.toFixed(1)}
            </p>
            <p>
              Editorial {photo.analysis.editorialScore.toFixed(1)} · Brand fit {photo.analysis.brandFitScore.toFixed(1)}
            </p>
            <p className="italic">{photo.analysis.verdictReason}</p>
            {photo.suggestedContentType && <p>Suggested: {photo.suggestedContentType}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
