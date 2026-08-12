"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type UploadState = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

async function uploadOne(weddingId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/weddings/${weddingId}/photos`, { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
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
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const startUpload = useCallback(
    async (fileList: FileList) => {
      const accepted = Array.from(fileList).filter((f) => ACCEPTED.includes(f.type));
      const rejected = fileList.length - accepted.length;
      if (rejected > 0) {
        // eslint-disable-next-line no-alert
        console.warn(`${rejected} file(s) skipped — only JPG, PNG, and WEBP are supported.`);
      }
      if (accepted.length === 0) return;

      setBusy(true);
      const initial: UploadState[] = accepted.map((f) => ({ name: f.name, status: "pending" }));
      setFiles(initial);

      await withConcurrency(accepted, 4, async (file, idx) => {
        setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: "uploading" } : f)));
        try {
          await uploadOne(weddingId, file);
          setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: "done" } : f)));
        } catch (err) {
          setFiles((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, status: "error", error: err instanceof Error ? err.message : "Failed" } : f))
          );
        }
      });

      setBusy(false);
      router.refresh();
    },
    [weddingId, router]
  );

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

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
        <p className="font-sans text-sm text-ink-soft mb-6">JPG, JPEG, PNG, or WEBP. Upload the full batch at once.</p>
        <Button variant="secondary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : "Select photos"}
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
