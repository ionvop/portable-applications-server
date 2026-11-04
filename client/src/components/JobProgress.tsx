import type { Job } from "../types"
import { formatBytes } from "../lib/format"
import { jobPercent, jobStatusLabel } from "../lib/jobs"

interface JobProgressProps {
  job: Job
  className?: string
}

/**
 * Live progress for one install job: phase, bar and byte counts.
 *
 * The total is prefixed with `~` because the server streams the archive
 * chunked, so the client only knows the manifest's *uncompressed* size. The
 * bar is therefore an estimate that can finish below 100% and snaps to full
 * when the job completes.
 */
export function JobProgress({ job, className = "" }: JobProgressProps) {
  const percent = jobPercent(job)
  const known = job.total_bytes > 0

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-base-content/60">
        <span>{jobStatusLabel(job.status)}</span>
        <span className="font-mono">{known ? `${percent}%` : "—"}</span>
      </div>

      <progress
        className="progress progress-primary mt-1 w-full"
        value={known ? percent : undefined}
        max={100}
        aria-label={`${job.title || "Install"} progress`}
      />

      <div className="mt-1 font-mono text-xs text-base-content/60">
        {formatBytes(job.received_bytes)}
        {known ? ` / ~${formatBytes(job.total_bytes)}` : ""}
      </div>
    </div>
  )
}
