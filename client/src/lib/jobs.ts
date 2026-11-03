import type { Job, JobStatus } from "../types"

/** Statuses a job can still leave. Everything else is history. */
const ACTIVE_STATUSES: JobStatus[] = ["queued", "downloading", "extracting"]

/** Whether the job is still running, i.e. worth polling for. */
export function isActiveJob(job: Job): boolean {
  return ACTIVE_STATUSES.includes(job.status)
}

/** Whether any job in the list is still running. */
export function hasActiveJobs(jobs: Job[]): boolean {
  return jobs.some(isActiveJob)
}

/**
 * Progress as a 0–100 percentage.
 *
 * `total_bytes` is an estimate (the manifest's uncompressed size when the
 * server streams chunked), so the ratio is clamped rather than trusted.
 */
export function jobPercent(job: Job): number {
  if (job.total_bytes <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((job.received_bytes / job.total_bytes) * 100)))
}

/** Human-readable phase label for a job's status. */
export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "Waiting to start"
    case "downloading":
      return "Downloading"
    case "extracting":
      return "Extracting"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
  }
}
