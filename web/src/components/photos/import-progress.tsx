"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type JobStatus = "PENDING" | "IMPORTING" | "ANALYZING" | "COMPLETED" | "FAILED";

type Job = {
  id: string;
  status: JobStatus;
  totalFiles: number;
  importedFiles: number;
  analyzedFiles: number;
  errorMessage: string | null;
  sourceLabel: string | null;
};

const STATUS_COPY: Record<JobStatus, string> = {
  PENDING: "Preparing import…",
  IMPORTING: "Importing photographs…",
  ANALYZING: "Running AI curation…",
  COMPLETED: "Curation ready.",
  FAILED: "Import failed.",
};

/**
 * Polls a PhotoImportJob and renders its Importing -> Analyzing ->
 * Completed progress, then auto-navigates to AI Curation once done — the
 * single UI both device and cloud imports drive, so "select a folder ->
 * imported -> curated" never needs a second manual action.
 */
export function ImportProgress({ jobId, weddingId, onDismiss }: { jobId: string; weddingId: string; onDismiss?: () => void }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/import-jobs/${jobId}`);
        if (!res.ok) throw new Error("Lost track of the import job.");
        const body = (await res.json()) as { job: Job };
        if (cancelled) return;
        setJob(body.job);

        if (body.job.status === "COMPLETED" && !redirectedRef.current) {
          redirectedRef.current = true;
          setTimeout(() => {
            if (!cancelled) router.push(`/weddings/${weddingId}/curation`);
          }, 1200);
          return; // stop polling
        }
        if (body.job.status === "FAILED") return; // stop polling, show error state

        timer = setTimeout(poll, 1200);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, weddingId, router]);

  if (error) {
    return <p className="font-sans text-sm text-reject">{error}</p>;
  }
  if (!job) {
    return <p className="font-sans text-sm text-ink-soft">Starting import…</p>;
  }

  const progressCount = job.status === "ANALYZING" ? job.analyzedFiles : job.importedFiles;
  const progressPct = job.totalFiles > 0 ? Math.round((progressCount / job.totalFiles) * 100) : 0;

  return (
    <div className="border border-hairline p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-serif text-xl">{STATUS_COPY[job.status]}</p>
        {job.status !== "FAILED" && job.status !== "COMPLETED" && (
          <p className="font-sans text-xs text-ink-soft">
            {progressCount}/{job.totalFiles || "…"}
          </p>
        )}
      </div>

      {job.sourceLabel && <p className="font-sans text-xs text-ink-soft mb-3">from “{job.sourceLabel}”</p>}

      {(job.status === "IMPORTING" || job.status === "ANALYZING") && (
        <div className="h-1 bg-paper">
          <div className="h-1 bg-gold transition-all duration-500" style={{ width: `${Math.max(4, progressPct)}%` }} />
        </div>
      )}

      {job.status === "COMPLETED" && (
        <p className="font-sans text-xs text-ink-soft">
          {job.analyzedFiles} photo{job.analyzedFiles === 1 ? "" : "s"} curated — opening AI Curation…
        </p>
      )}

      {job.status === "FAILED" && (
        <div>
          <p className="font-sans text-xs text-reject mb-3">{job.errorMessage || "The import could not be completed."}</p>
          {onDismiss && (
            <button onClick={onDismiss} className="font-sans text-xs text-ink-soft hover:text-ink underline">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
