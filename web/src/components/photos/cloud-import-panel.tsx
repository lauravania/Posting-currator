"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ImportProgress } from "./import-progress";

type ProviderSlug = "google-drive" | "dropbox";
type Folder = { id: string; name: string };
type Crumb = { id: string | null; name: string };

export type ProviderStatus = {
  configured: boolean; // OAuth client is set up ("Connect" flow available)
  connected: boolean;
  accountLabel: string | null;
  linkImportAvailable: boolean; // simple API key/token set up (no OAuth needed)
};

const LINK_PLACEHOLDER: Record<ProviderSlug, string> = {
  "google-drive": "https://drive.google.com/drive/folders/…",
  dropbox: "https://www.dropbox.com/scl/fo/…",
};

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
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: label }]);
  const [loading, setLoading] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connected, setConnected] = useState(status.connected);
  const [link, setLink] = useState("");
  const [importingLink, setImportingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const current = path[path.length - 1];

  useEffect(() => {
    if (!connected || !browserOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/integrations/${provider}/folders${current.id ? `?parentId=${encodeURIComponent(current.id)}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not load folders.");
        return res.json();
      })
      .then((body: { folders: Folder[] }) => {
        if (!cancelled) setFolders(body.folders);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load folders.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, browserOpen, current.id, provider]);

  async function startFolderImport(folder: Folder) {
    setError(null);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/import/cloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider === "google-drive" ? "GOOGLE_DRIVE" : "DROPBOX", folderId: folder.id, folderName: folder.name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not start import.");
      const body = (await res.json()) as { jobId: string };
      setJobId(body.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start import.");
    }
  }

  async function startLinkImport() {
    if (!link.trim()) return;
    setLinkError(null);
    setImportingLink(true);
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
      setLinkError(err instanceof Error ? err.message : "Could not start import.");
    } finally {
      setImportingLink(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
      setConnected(false);
      setFolders(null);
      setBrowserOpen(false);
      setPath([{ id: null, name: label }]);
    } finally {
      setDisconnecting(false);
    }
  }

  if (jobId) {
    return <ImportProgress jobId={jobId} weddingId={weddingId} onDismiss={() => setJobId(null)} />;
  }

  const canPasteLink = status.linkImportAvailable || connected;

  if (!canPasteLink && !status.configured) {
    return (
      <div className="border border-dashed border-hairline p-6">
        <p className="font-serif text-lg mb-2">{label}</p>
        <p className="font-sans text-xs text-ink-soft">
          Not configured on this deployment yet — an admin needs to set the {label} credentials (see .env.example:
          the simple link-import key/token, or the full OAuth client for a &ldquo;Connect&rdquo; flow).
        </p>
      </div>
    );
  }

  return (
    <div className="border border-hairline p-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-serif text-lg">{label}</p>
        {connected && (
          <div className="text-right">
            {status.accountLabel && <p className="font-sans text-xs text-ink-soft">{status.accountLabel}</p>}
            <button onClick={disconnect} disabled={disconnecting} className="font-sans text-xs text-ink-soft hover:text-reject">
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        )}
      </div>

      {canPasteLink && (
        <div>
          <p className="eyebrow mb-2">Drop a shared folder link</p>
          <p className="font-sans text-xs text-ink-soft mb-3">
            Paste a {label} folder link shared as &ldquo;Anyone with the link&rdquo; — importing starts immediately,
            no sign-in needed.
          </p>
          <div className="flex gap-2">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={LINK_PLACEHOLDER[provider]}
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={startLinkImport} disabled={importingLink || !link.trim()}>
              {importingLink ? "Starting…" : "Import"}
            </Button>
          </div>
          {linkError && <p className="font-sans text-xs text-reject mt-2">{linkError}</p>}
        </div>
      )}

      {status.configured && !connected && (
        <div className={canPasteLink ? "pt-5 border-t border-hairline" : ""}>
          <p className="font-sans text-xs text-ink-soft mb-3">
            Or connect a {label} account to browse and import from private folders too — authorized via {label}
            &rsquo;s own sign-in, never your password.
          </p>
          <a href={`/api/integrations/${provider}/connect?weddingId=${weddingId}`}>
            <Button variant="secondary" type="button">
              Connect {label}
            </Button>
          </a>
        </div>
      )}

      {connected && (
        <div className={canPasteLink ? "pt-5 border-t border-hairline" : ""}>
          {!browserOpen ? (
            <button onClick={() => setBrowserOpen(true)} className="font-sans text-xs text-ink-soft hover:text-ink underline">
              Or browse folders in the connected account
            </button>
          ) : (
            <div>
              <div className="font-sans text-xs text-ink-soft mb-3 flex flex-wrap gap-1">
                {path.map((crumb, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1">/</span>}
                    <button
                      onClick={() => setPath(path.slice(0, i + 1))}
                      className={i === path.length - 1 ? "text-ink" : "hover:text-ink underline"}
                      disabled={i === path.length - 1}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>

              {loading && <p className="font-sans text-xs text-ink-soft">Loading folders…</p>}
              {error && <p className="font-sans text-xs text-reject mb-2">{error}</p>}
              {!loading && folders && folders.length === 0 && <p className="font-sans text-xs text-ink-soft">No subfolders here.</p>}

              <ul className="divide-y divide-hairline">
                {folders?.map((folder) => (
                  <li key={folder.id} className="flex items-center justify-between py-2.5">
                    <button
                      onClick={() => setPath([...path, { id: folder.id, name: folder.name }])}
                      className="font-sans text-sm text-left hover:underline flex-1"
                    >
                      📁 {folder.name}
                    </button>
                    <button
                      onClick={() => startFolderImport(folder)}
                      className="font-sans text-[11px] uppercase tracking-wide border border-hairline px-2.5 py-1 hover:border-gold shrink-0"
                    >
                      Import this folder
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
