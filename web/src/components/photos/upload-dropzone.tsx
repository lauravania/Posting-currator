"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImportProgress } from "./import-progress";

type UploadState = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

async function startJob(weddingId: string, totalFiles: number): Promise<string> {
  const res = await fetch(`/api/weddings/${weddingId}/import/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ totalFiles }),
  });
  if (!res.ok) throw new Error("Could not start the import.");
  const body = (await res.json()) as { jobId: string };
  return body.jobId;
}

async function uploadOne(weddingId: string, jobId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("jobId", jobId);
  const res = await fetch(`/api/weddings/${weddingId}/photos`, { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
}

async function finalizeJob(weddingId: string, jobId: string): Promise<void> {
  const res = await fetch(`/api/weddings/${weddingId}/import/device/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) throw new Error("Could not finish the import.");
}

async function withConcurrency<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export function UploadDropzone({ weddingId }: { weddingId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const startUpload = useCallback(
    async (fileList: FileList) => {
      const accepted = Array.from(fileList).filter((f) => ACCEPTED.includes(f.type));
      if (accepted.length === 0) return;

      setBusy(true);
      const initial: UploadState[] = accepted.map((f) => ({ name: f.name, status: "pending" }));
      setFiles(initial);

      try {
        const newJobId = await startJob(weddingId, accepted.length);

        await withConcurrency(accepted, 4, async (file, idx) => {
          setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: "uploading" } : f)));
          try {
            await uploadOne(weddingId, newJobId, file);
            setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: "done" } : f)));
          } catch (err) {
            setFiles((prev) =>
              prev.map((f, i) => (i === idx ? { ...f, status: "error", error: err instanceof Error ? err.message : "Failed" } : f))
            );
          }
        });

        // Auto-trigger AI curation on whatever successfully uploaded — no
        // second manual action, per the workflow requirement.
        await finalizeJob(weddingId, newJobId);
        setJobId(newJobId);
      } finally {
        setBusy(false);
      }
    },
    [weddingId]
  );

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  if (jobId) {
    return <ImportProgress jobId={jobId} weddingId={weddingId} onDismiss={() => setJobId(null)} />;
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void startUpload(e.dataTransfer.files);
        }}
        className={`border border-dashed px-8 py-14 text-center transition-colors ${
          dragOver ? "border-gold bg-paper/50" : "border-hairline"
        }`}
      >
        <p className="font-serif text-xl mb-2">Drop photographs here</p>
        <p className="font-sans text-sm text-ink-soft mb-6">
          JPG, JPEG, PNG, or WEBP. Upload the full batch — AI curation starts automatically once it&rsquo;s in.
        </p>
        <Button variant="secondary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : "Select photos from this device"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void startUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-5 font-sans text-xs text-ink-soft">
          <p>
            {doneCount}/{files.length} uploaded{errorCount > 0 ? ` · ${errorCount} failed` : ""}
          </p>
          {errorCount > 0 && (
            <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
              {files
                .filter((f) => f.status === "error")
                .map((f) => (
                  <li key={f.name} className="text-reject">
                    {f.name}: {f.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
