"use client";

import { useState } from "react";
import { UploadDropzone } from "./upload-dropzone";
import { CloudImportPanel, type ProviderStatus } from "./cloud-import-panel";

type Tab = "device" | "google-drive" | "dropbox" | "other";

export function AddPhotosTabs({
  weddingId,
  googleDriveStatus,
  dropboxStatus,
}: {
  weddingId: string;
  googleDriveStatus: ProviderStatus;
  dropboxStatus: ProviderStatus;
}) {
  const [tab, setTab] = useState<Tab>("device");

  const tabs: { id: Tab; label: string }[] = [
    { id: "device", label: "This device" },
    { id: "google-drive", label: "Google Drive" },
    { id: "dropbox", label: "Dropbox" },
    { id: "other", label: "Other link" },
  ];

  return (
    <div>
      <div className="flex gap-6 border-b border-hairline mb-6 font-sans text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 -mb-px border-b-2 transition-colors ${
              tab === t.id ? "border-gold text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "device" && <UploadDropzone weddingId={weddingId} />}
      {tab === "google-drive" && (
        <CloudImportPanel weddingId={weddingId} provider="google-drive" label="Google Drive" status={googleDriveStatus} />
      )}
      {tab === "dropbox" && <CloudImportPanel weddingId={weddingId} provider="dropbox" label="Dropbox" status={dropboxStatus} />}
      {tab === "other" && <CloudImportPanel weddingId={weddingId} provider="other" label="Other link" />}
    </div>
  );
}
