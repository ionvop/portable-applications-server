import type { Transfer } from "../types"
import { DownloadIcon } from "../components/icons"

interface TransfersViewProps {
  transfers: Transfer[]
}

const statusBadge: Record<Transfer["status"], string> = {
  active: "badge-info",
  completed: "badge-success",
  failed: "badge-error",
}

const statusLabel: Record<Transfer["status"], string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
}

export function TransfersView({ transfers }: TransfersViewProps) {
  const active = transfers.filter((t) => t.status === "active")
  const history = transfers.filter((t) => t.status !== "active")

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="stats stats-vertical w-full border border-base-300 bg-base-200 shadow-sm sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Active</div>
          <div className="stat-value text-2xl">{active.length}</div>
          <div className="stat-desc">Streaming now</div>
        </div>
        <div className="stat">
          <div className="stat-title">Completed today</div>
          <div className="stat-value text-2xl">14</div>
          <div className="stat-desc">Across 9 clients</div>
        </div>
        <div className="stat">
          <div className="stat-title">Failed</div>
          <div className="stat-value text-2xl">1</div>
          <div className="stat-desc">Client disconnected</div>
        </div>
        <div className="stat">
          <div className="stat-title">Transferred</div>
          <div className="stat-value text-2xl">32.6 GB</div>
          <div className="stat-desc">Since server start</div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <h2 className="card-title text-base">Active transfers</h2>
          {active.length === 0 ? (
            <p className="text-sm text-base-content/60">
              No clients are downloading right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-5">
              {active.map((transfer) => (
                <li key={transfer.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <DownloadIcon
                        width={16}
                        height={16}
                        className="text-info"
                      />
                      <span className="text-sm font-medium">
                        {transfer.entryTitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-base-content/60">
                      <span className="font-mono">{transfer.client}</span>
                      <span>{transfer.sizeMb} MB</span>
                      <span>started {transfer.startedAt}</span>
                    </div>
                  </div>
                  <progress
                    className="progress progress-info h-2"
                    value={transfer.progress}
                    max={100}
                  />
                  <div className="flex justify-between text-xs text-base-content/60">
                    <span>{transfer.progress}% complete</span>
                    <span>
                      {Math.round((transfer.sizeMb * transfer.progress) / 100)} MB
                      sent
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <h2 className="card-title text-base">Transfer history</h2>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Client</th>
                  <th>Size</th>
                  <th>Started</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-base-300/40">
                    <td className="font-medium">{transfer.entryTitle}</td>
                    <td className="font-mono text-xs">{transfer.client}</td>
                    <td className="text-xs">{transfer.sizeMb} MB</td>
                    <td className="text-xs text-base-content/60">
                      {transfer.startedAt}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${statusBadge[transfer.status]}`}
                      >
                        {statusLabel[transfer.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
