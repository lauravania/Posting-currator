"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ImportProgress } from "./import-progress";

type ProviderSlug = "google-drive" | "dropbox";

export type ProviderStatus = {
  configured: boolean; // OAuth client is set up (kept for future use — not surfaced in this UI)
  connected: boolean; // an existing OAuth connection, if any, is still preferred under the hood
  accountLabel: string | null;
  linkImportAvailable: boolean; // simple API key/token set up — this is what unlocks the tab
};

const LINK_PLACEHOLDER: Record<ProviderSlug, string> = {
  "google-drive": "https://drive.google.com/drive/folders/…",
  dropbox: "https://www.dropbox.com/scl/fo/…",
};

/**
 * Deliberately just a link box: paste a shared folder link, hit Import,
 * done. No connect/browse UI — the org's existing OAuth connection (if
 * any, from an earlier session) is still used automatically under the
 * hood by /api/weddings/[id]/import/link, it's just not surfaced here.
 */
export function CloudImportPanel({
  weddingId,
  provider,
  label,
  status,
}: {
  weddingId: string;
  provider: ProviderSlug;
  label: string;
  status: ProviderStatus;
}) {
  const [link, setLink] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const canPasteLink = status.linkImportAvailable || status.connected;

  async function startImport() {
    if (!link.trim()) return;
    setError(null);
    setImporting(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/import/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, link: link.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not start import.");
      const body = (await res.json()) as { jobId: string };
      setJobId(body.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start import.");
    } finally {
      setImporting(false);
    }
  }

  if (jobId) {
    return <ImportProgress jobId={jobId} weddingId={weddingId} onDismiss={() => setJobId(null)} />;
  }

  if (!canPasteLink) {
    return (
      <div className="border border-dashed border-hairline p-6">
        <p className="font-serif text-lg mb-2">{label}</p>
        <p className="font-sans text-xs text-ink-soft">
          Not configured on this deployment yet — an admin needs to set the {label} link-import credential (see
          .env.example).
        </p>
      </div>
    );
  }

  return (
    <div className="border border-hairline p-6">
      <p className="font-serif text-lg mb-2">{label}</p>
      <p className="font-sans text-xs text-ink-soft mb-4">
        Paste a {label} folder link shared as &ldquo;Anyone with the link&rdquo; — importing starts immediately, no
        sign-in needed.
      </p>
      <div className="flex gap-2">
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") startImport();
          }}
          placeholder={LINK_PLACEHOLDER[provider]}
          className="flex-1"
        />
        <Button type="button" onClick={startImport} disabled={importing || !link.trim()}>
          {importing ? "Starting…" : "Import"}
        </Button>
      </div>
      {error && <p className="font-sans text-xs text-reject mt-2">{error}</p>}
    </div>
  );
}
