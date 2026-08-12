"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RunCurationButton({ weddingId, pendingCount }: { weddingId: string; pendingCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/analyze-all`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Analysis failed.");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <div>
      <Button onClick={run} disabled={busy}>
        {busy ? `Analyzing ${pendingCount} photo${pendingCount === 1 ? "" : "s"}…` : `Run AI curation on ${pendingCount} photo${pendingCount === 1 ? "" : "s"}`}
      </Button>
      {error && <p className="text-xs text-reject font-sans mt-2">{error}</p>}
    </div>
  );
}
