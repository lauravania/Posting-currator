"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ImportProgress } from "./import-progress";

type ProviderSlug = "google-drive" | "dropbox" | "other";

export type ProviderStatus = {
  configured: boolean; // OAuth client is set up (kept for future use — not surfaced in this UI)
  connected: boolean; // an existing OAuth connection, if any, is still preferred under the hood
  accountLabel: string | null;
  linkImportAvailable: boolean; // simple API key/token set up — this is what unlocks the tab
};

type CloudImage = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  thumbnailUrl?: string | null;
};

type PreviewState = {
  folderName: string;
  images: CloudImage[];
  link: string;
};

const LINK_PLACEHOLDER: Record<ProviderSlug, string> = {
  "google-drive": "https://drive.google.com/drive/folders/…",
  dropbox: "https://www.dropbox.com/scl/fo/…",
  other: "https://yourname.pixieset.com/… or any gallery link",
};

const LINK_HELP: Record<ProviderSlug, string> = {
  "google-drive":
    "Paste a Google Drive folder link shared as “Anyone with the link” to see what’s inside and choose which photos to import.",
  dropbox:
    "Paste a Dropbox shared link to see what’s inside and choose which photos to import.",
  other:
    "Paste a link to a gallery page — Pixieset, Apple Shared Albums, SmugMug, Zenfolio, or a photographer’s own site — and this reads the photos directly off the page. Best-effort: some galleries load their photos with JavaScript that a direct page fetch can’t see, in which case try Google Drive/Dropbox instead, or paste a direct link to one photo.",
};

/**
 * Two-step "drop a link" flow: paste a shared folder link and open it —
 * that lists what's inside (no import yet) as a thumbnail grid the user
 * checks photos in — then "Import selected" actually brings just those
 * into the wedding and kicks off AI curation. No OAuth consent screen
 * needed as long as the provider's link-import credential is configured;
 * an existing "Connect" OAuth connection from an earlier session is used
 * automatically under the hood if present.
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
  // "Other" links need no credential — there's nothing to configure, so
  // no status to check.
  status?: ProviderStatus;
}) {
  const [link, setLink] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const canPasteLink = provider === "other" || Boolean(status?.linkImportAvailable || status?.connected);

  function thumbnailSrc(image: CloudImage, previewLink: string): string {
    if (image.thumbnailUrl) return image.thumbnailUrl;
    const params = new URLSearchParams({ provider, link: previewLink, imageId: image.id, name: image.name });
    return `/api/weddings/${weddingId}/import/link/thumbnail?${params.toString()}`;
  }

  async function openLink() {
    if (!link.trim()) return;
    setError(null);
    setOpening(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/import/link/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, link: link.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not open that link.");
      const body = (await res.json()) as { folderName: string; images: CloudImage[] };
      setPreview({ folderName: body.folderName, images: body.images, link: link.trim() });
      setSelected(new Set(body.images.map((img) => img.id))); // default: everything selected
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that link.");
    } finally {
      setOpening(false);
    }
  }

  async function importSelected() {
    if (!preview || selected.size === 0) return;
    setError(null);
    setImporting(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/import/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, link: preview.link, imageIds: Array.from(selected) }),
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setPreview(null);
    setSelected(new Set());
    setLink("");
    setError(null);
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

  // Step 2: browse the opened folder and select which photos to import.
  if (preview) {
    const allSelected = selected.size === preview.images.length && preview.images.length > 0;
    return (
      <div className="border border-hairline p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="font-serif text-lg">{preview.folderName}</p>
          <button onClick={reset} className="font-sans text-xs text-ink-soft hover:text-ink underline">
            Change link
          </button>
        </div>
        <p className="font-sans text-xs text-ink-soft mb-4">
          {preview.images.length} photo{preview.images.length === 1 ? "" : "s"} found — choose which to import.
        </p>

        {preview.images.length === 0 ? (
          <p className="font-sans text-xs text-ink-soft">No images found in that folder.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setSelected(allSelected ? new Set() : new Set(preview.images.map((img) => img.id)))}
                className="font-sans text-xs text-ink-soft hover:text-ink underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <p className="font-sans text-xs text-ink-soft">{selected.size} selected</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[420px] overflow-y-auto scrollbar-thin p-1">
              {preview.images.map((img) => {
                const isSelected = selected.has(img.id);
                return (
                  <label
                    key={img.id}
                    className={`relative block aspect-[4/5] cursor-pointer border overflow-hidden bg-paper ${isSelected ? "border-gold" : "border-hairline"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(img.id)}
                      className="absolute top-1.5 left-1.5 z-10 w-4 h-4"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element -- external, per-provider hosts; next/image domain allowlisting doesn't apply */}
                    <img src={thumbnailSrc(img, preview.link)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-4">
          <Button type="button" onClick={importSelected} disabled={importing || selected.size === 0}>
            {importing ? "Starting…" : `Import ${selected.size || ""} selected`}
          </Button>
        </div>
        {error && <p className="font-sans text-xs text-reject mt-2">{error}</p>}
      </div>
    );
  }

  // Step 1: paste a link and open it.
  return (
    <div className="border border-hairline p-6">
      <p className="font-serif text-lg mb-2">{label}</p>
      <p className="font-sans text-xs text-ink-soft mb-4">{LINK_HELP[provider]}</p>
      <div className="flex gap-2">
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") openLink();
          }}
          placeholder={LINK_PLACEHOLDER[provider]}
          className="flex-1"
        />
        <Button type="button" onClick={openLink} disabled={opening || !link.trim()}>
          {opening ? "Opening…" : "Open"}
        </Button>
      </div>
      {error && <p className="font-sans text-xs text-reject mt-2">{error}</p>}
    </div>
  );
}
