import type { Job } from "../types"
import { formatBytes, formatRelativeTime } from "../lib/format"
import { hasActiveJobs, isActiveJob, jobPercent, jobStatusLabel } from "../lib/jobs"
import { CheckIcon, DownloadIcon } from "../components/icons"

interface DownloadsViewProps {
  /** Active jobs first, then finished history — the shape `GET /api/jobs` returns. */
  jobs: Job[]
}

/**
 * Transfer queue and history.
 *
 * Active jobs render a live progress bar fed by `received_bytes`; finished jobs
 * come from the persisted `transfers` table, so the list survives a restart.
 * The parent polls `/api/jobs` while anything is running.
 */
export function DownloadsView({ jobs }: DownloadsViewProps) {
  const active = jobs.filter(isActiveJob)
  const history = jobs.filter((job) => !isActiveJob(job))

  return (
    <div className="flex flex-col gap-5">
      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="card-title text-sm">Active transfers</h2>
            {hasActiveJobs(jobs) && (
              <span className="badge badge-info badge-sm gap-1">
                <span className="loading loading-spinner loading-xs" />
                {active.length} running
              </span>
            )}
          </div>

          {active.length === 0 ? (
            <div className="flex items-center gap-2 rounded-field bg-base-100 px-3 py-4 text-xs text-base-content/60">
              <CheckIcon width={16} height={16} className="text-success" />
              Nothing is downloading right now.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((job) => (
                <ActiveJobRow key={job.id} job={job} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-0 p-0">
          <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
            <h2 className="card-title text-sm">History</h2>
            <span className="text-xs text-base-content/60">
              {history.length === 0 ? "No transfers yet" : `${history.length} recent`}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <DownloadIcon width={28} height={28} className="opacity-40" />
              <p className="text-sm font-medium">Nothing has been downloaded yet</p>
              <p className="max-w-md text-xs text-base-content/60">
                Installs you start from the Store appear here, and the list is kept across
                restarts.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-base-300">
              {history.map((job) => (
                <HistoryJobRow key={job.id} job={job} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A running job: title, phase, byte counts and a live progress bar.
 *
 * The total is prefixed with `~` because the server streams the archive
 * chunked, so the client only knows the manifest's *uncompressed* size. The
 * bar is therefore an estimate that can finish below 100% and snaps to full
 * when the job completes.
 */
function ActiveJobRow({ job }: { job: Job }) {
  const percent = jobPercent(job)
  const known = job.total_bytes > 0

  return (
    <li className="rounded-field bg-base-100 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{job.title || `Application ${job.entry_id}`}</p>
        <span className="text-xs text-base-content/60">{jobStatusLabel(job.status)}</span>
      </div>

      <progress
        className="progress progress-primary mt-2 w-full"
        value={known ? percent : undefined}
        max={100}
        aria-label={`${job.title || "Install"} progress`}
      />

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
        <span className="font-mono">
          {formatBytes(job.received_bytes)}
          {known ? ` / ~${formatBytes(job.total_bytes)}` : ""}
        </span>
        <span className="font-mono">{known ? `${percent}%` : "—"}</span>
      </div>
    </li>
  )
}

/** A finished job: outcome, size and when it finished. */
function HistoryJobRow({ job }: { job: Job }) {
  const failed = job.status === "failed"
  const when = job.finished_at ?? job.started_at

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.title || `Application ${job.entry_id}`}</p>
        <p className="truncate text-xs text-base-content/60">
          {failed ? job.error || "The install failed." : formatBytes(job.received_bytes)}
          {when ? ` · ${formatRelativeTime(when)}` : ""}
        </p>
      </div>
      <span className={`badge badge-sm ${failed ? "badge-error" : "badge-success"}`}>
        {jobStatusLabel(job.status)}
      </span>
    </li>
  )
}
