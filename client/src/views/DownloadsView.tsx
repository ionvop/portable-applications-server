import type { Transfer, TransferStatus } from "../types"
import { formatBytes, formatPercent, formatRelativeTime } from "../lib/format"
import { CheckIcon, ChevronRightIcon, RefreshIcon } from "../components/icons"

interface DownloadsViewProps {
  transfers: Transfer[]
}

const statusBadge: Record<TransferStatus, string> = {
  queued: "badge-ghost",
  downloading: "badge-info",
  extracting: "badge-warning",
  done: "badge-success",
  failed: "badge-error",
}

const statusLabel: Record<TransferStatus, string> = {
  queued: "Queued",
  downloading: "Downloading",
  extracting: "Extracting",
  done: "Complete",
  failed: "Failed",
}

const isActive = (status: TransferStatus) =>
  status === "downloading" || status === "extracting" || status === "queued"

/** Download queue plus transfer history. */
export function DownloadsView({ transfers }: DownloadsViewProps) {
  const active = transfers.filter((transfer) => isActive(transfer.status))
  const history = transfers.filter((transfer) => !isActive(transfer.status))

  const received = active.reduce((total, row) => total + row.received_bytes, 0)
  const total = active.reduce((sum, row) => sum + row.total_bytes, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="stats stats-horizontal w-full border border-base-300 bg-base-200">
        <div className="stat">
          <div className="stat-title text-xs">In progress</div>
          <div className="stat-value text-2xl">{active.length}</div>
          <div className="stat-desc">Queued, downloading or extracting</div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">Transferred</div>
          <div className="stat-value text-2xl">{formatPercent(received, total)}</div>
          <div className="stat-desc font-mono">
            {formatBytes(received)} of {formatBytes(total)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">Completed</div>
          <div className="stat-value text-2xl">
            {transfers.filter((row) => row.status === "done").length}
          </div>
          <div className="stat-desc">This session</div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <h2 className="card-title text-sm">Active transfers</h2>

          {active.length === 0 ? (
            <div className="flex items-center gap-2 rounded-field bg-base-100 px-3 py-4 text-xs text-base-content/60">
              <CheckIcon width={16} height={16} className="text-success" />
              Nothing is downloading right now.
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {active.map((transfer) => (
                <li key={transfer.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{transfer.title}</p>
                    <span className={`badge badge-sm ${statusBadge[transfer.status]}`}>
                      {statusLabel[transfer.status]}
                    </span>
                  </div>
                  <progress
                    className={`progress h-2 ${
                      transfer.status === "extracting" ? "progress-warning" : "progress-info"
                    }`}
                    value={transfer.progress}
                    max={100}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
                    <span className="font-mono truncate">{transfer.directory}</span>
                    <span className="font-mono">
                      {formatBytes(transfer.received_bytes)} / {formatBytes(transfer.total_bytes)} ·{" "}
                      {transfer.progress}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-3">
          <h2 className="card-title text-sm">History</h2>

          {history.length === 0 ? (
            <p className="text-xs text-base-content/60">No completed transfers yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-box border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Size</th>
                    <th>Started</th>
                    <th className="text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((transfer) => (
                    <tr key={transfer.id} className="hover:bg-base-300/40">
                      <td className="font-medium">{transfer.title}</td>
                      <td>
                        <span className={`badge badge-sm ${statusBadge[transfer.status]}`}>
                          {statusLabel[transfer.status]}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{formatBytes(transfer.total_bytes)}</td>
                      <td className="text-xs text-base-content/60">
                        {formatRelativeTime(transfer.started_at)}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs gap-1"
                          aria-label={`Show details for ${transfer.title}`}
                        >
                          {transfer.status === "failed" ? (
                            <RefreshIcon width={14} height={14} />
                          ) : (
                            <ChevronRightIcon width={14} height={14} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
