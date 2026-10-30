import type { ActivityItem, CatalogEntry, SystemInfo, Transfer } from "../types"
import { Thumbnail } from "../components/Thumbnail"
import {
  CatalogIcon,
  ChevronRightIcon,
  DownloadIcon,
  FilesIcon,
  PlusIcon,
  ServerIcon,
} from "../components/icons"

interface DashboardViewProps {
  system: SystemInfo
  entries: CatalogEntry[]
  transfers: Transfer[]
  activity: ActivityItem[]
  onOpenCatalog: () => void
  onOpenEntry: (entry: CatalogEntry) => void
  onOpenFiles: () => void
  onOpenTransfers: () => void
}

const toneClass: Record<ActivityItem["tone"], string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
}

export function DashboardView({
  system,
  entries,
  transfers,
  activity,
  onOpenCatalog,
  onOpenEntry,
  onOpenFiles,
  onOpenTransfers,
}: DashboardViewProps) {
  const activeTransfers = transfers.filter((t) => t.status === "active")
  const recentEntries = entries.slice(0, 4)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="stats stats-vertical w-full border border-base-300 bg-base-200 shadow-sm sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Catalog entries</div>
          <div className="stat-value text-2xl">{system.entry_count}</div>
          <div className="stat-desc">Applications and games</div>
        </div>
        <div className="stat">
          <div className="stat-title">LAN address</div>
          <div className="stat-value font-mono text-2xl">{system.lan_ip}</div>
          <div className="stat-desc">
            Listening on port {system.port}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Active transfers</div>
          <div className="stat-value text-2xl">{activeTransfers.length}</div>
          <div className="stat-desc">Clients downloading now</div>
        </div>
        <div className="stat">
          <div className="stat-title">Uptime</div>
          <div className="stat-value text-2xl">3h 12m</div>
          <div className="stat-desc">Since last restart</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card border border-base-300 bg-base-200 lg:col-span-2">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">Recent catalog entries</h2>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                onClick={onOpenCatalog}
              >
                View all
                <ChevronRightIcon width={14} height={14} />
              </button>
            </div>

            <ul className="flex flex-col divide-y divide-base-300">
              {recentEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-base-300/40"
                    onClick={() => onOpenEntry(entry)}
                  >
                    <Thumbnail
                      entry={entry}
                      className="size-11 shrink-0 rounded-field"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.title}
                      </p>
                      <p className="truncate font-mono text-xs text-base-content/60">
                        {entry.directory}/{entry.executable}
                      </p>
                    </div>
                    <span className="badge badge-ghost badge-sm shrink-0">
                      {entry.updated_at?.slice(0, 10) ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">
                <ServerIcon width={18} height={18} />
                Server status
              </h2>
              <div className="flex items-center gap-2">
                <span className="status status-success" />
                <span className="text-sm">Distribution service running</span>
              </div>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Host</dt>
                  <dd className="font-mono">{system.host}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Port</dt>
                  <dd className="font-mono">{system.port}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Apps folder</dt>
                  <dd className="truncate font-mono">{system.apps_dir}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Quick actions</h2>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="btn btn-sm justify-start gap-2"
                  onClick={onOpenCatalog}
                >
                  <PlusIcon width={16} height={16} />
                  Add catalog entry
                </button>
                <button
                  type="button"
                  className="btn btn-sm justify-start gap-2"
                  onClick={onOpenFiles}
                >
                  <FilesIcon width={16} height={16} />
                  Browse application files
                </button>
                <button
                  type="button"
                  className="btn btn-sm justify-start gap-2"
                  onClick={onOpenTransfers}
                >
                  <DownloadIcon width={16} height={16} />
                  View transfers
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">Active transfers</h2>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                onClick={onOpenTransfers}
              >
                All transfers
                <ChevronRightIcon width={14} height={14} />
              </button>
            </div>
            {activeTransfers.length === 0 ? (
              <p className="text-sm text-base-content/60">
                No clients are downloading right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {activeTransfers.map((transfer) => (
                  <li key={transfer.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">
                        {transfer.entryTitle}
                      </p>
                      <span className="shrink-0 font-mono text-xs text-base-content/60">
                        {transfer.client}
                      </span>
                    </div>
                    <progress
                      className="progress progress-primary h-1.5"
                      value={transfer.progress}
                      max={100}
                    />
                    <div className="flex justify-between text-xs text-base-content/60">
                      <span>{transfer.progress}%</span>
                      <span>{transfer.sizeMb} MB</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">Recent activity</h2>
            <ul className="flex flex-col gap-3">
              {activity.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${toneClass[item.tone]}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.message}</p>
                    <p className="truncate text-xs text-base-content/60">
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-base-content/40">
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-base-content/40">
        <CatalogIcon width={14} height={14} />
        Prototype preview — data is static and no requests are sent.
      </div>
    </div>
  )
}
