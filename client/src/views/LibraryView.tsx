import { useState } from "react"
import type { CatalogApp, Install, LaunchResult } from "../types"
import { ApiError } from "../api/client"
import { Cover } from "../components/Cover"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { formatRelativeTime } from "../lib/format"
import { DownloadIcon, LibraryIcon, PlayIcon, TrashIcon } from "../components/icons"

interface LibraryViewProps {
  /** Rows from `GET /api/apps/installed` — the source of truth for this screen. */
  installs: Install[]
  /** The server catalog, used only to look up update state. */
  catalog: CatalogApp[]
  onOpenApp: (app: CatalogApp) => void
  onOpenInstall: (install: Install) => void
  onBrowse: () => void
  /** Starts an installed application. */
  onLaunch: (entryId: number) => Promise<LaunchResult>
  /** Deletes the install row and its files. */
  onRemove: (entryId: number) => Promise<void>
}

/** Which row is mid-action, so only that row shows a spinner. */
interface RowBusy {
  entryId: number
  action: "launch" | "remove"
}

/** Turns any thrown value into text the UI can show. */
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}

/**
 * Installed applications, read from the local install table rather than
 * filtered out of the catalog: an entry deleted server-side still appears here
 * as long as its files are on disk.
 */
export function LibraryView({
  installs,
  catalog,
  onOpenApp,
  onOpenInstall,
  onBrowse,
  onLaunch,
  onRemove,
}: LibraryViewProps) {
  const [busy, setBusy] = useState<RowBusy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** The install awaiting confirmation, or `null` when no dialog is open. */
  const [pendingRemove, setPendingRemove] = useState<Install | null>(null)

  const catalogById = new Map(catalog.map((app) => [app.id, app]))

  /** The catalog entry for an install, when the server still lists it. */
  const entryFor = (install: Install) => catalogById.get(install.entry_id)

  const updates = installs.filter((install) => entryFor(install)?.update_available)

  const launch = async (install: Install) => {
    setBusy({ entryId: install.entry_id, action: "launch" })
    setError(null)
    setNotice(null)
    try {
      const result = await onLaunch(install.entry_id)
      setNotice(`Started ${install.title} (pid ${result.pid}).`)
    } catch (cause) {
      setError(messageFor(cause, `Could not start ${install.title}.`))
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const target = pendingRemove
    setBusy({ entryId: target.entry_id, action: "remove" })
    setError(null)
    setNotice(null)
    try {
      await onRemove(target.entry_id)
      setPendingRemove(null)
      setNotice(`Removed ${target.title} from this computer.`)
    } catch (cause) {
      setError(messageFor(cause, `Could not remove ${target.title}.`))
    } finally {
      setBusy(null)
    }
  }

  if (installs.length === 0) {
    return (
      <div className="card border border-dashed border-base-300 bg-base-200">
        <div className="card-body items-center gap-3 py-20 text-center">
          <LibraryIcon width={32} height={32} className="opacity-40" />
          <p className="text-sm font-medium">Nothing installed yet</p>
          <p className="text-xs text-base-content/60">
            Apps you install will be stored here and stay ready to launch.
          </p>
          <button type="button" className="btn btn-sm btn-primary mt-2" onClick={onBrowse}>
            Browse the catalog
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="text-xs text-success">
          {notice}
        </p>
      )}

      <div className="stats stats-horizontal w-full border border-base-300 bg-base-200">
        <div className="stat">
          <div className="stat-title text-xs">Installed</div>
          <div className="stat-value text-2xl">{installs.length}</div>
          <div className="stat-desc">Ready to launch</div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">Updates</div>
          <div className="stat-value text-2xl">{updates.length}</div>
          <div className="stat-desc">
            {updates.length === 0 ? "Everything is current" : "Newer builds available"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">Ready to launch</div>
          <div className="stat-value text-2xl">{installs.length - updates.length}</div>
          <div className="stat-desc">Installed and up to date</div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-0 p-0">
          <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
            <h2 className="card-title text-sm">Your library</h2>
            <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={onBrowse}>
              <DownloadIcon width={14} height={14} />
              Get more
            </button>
          </div>

          <ul className="divide-y divide-base-300">
            {installs.map((install) => {
              const entry = entryFor(install)
              const updateAvailable = entry?.update_available ?? false
              const installedAt = install.installed_at
                ? formatRelativeTime(install.installed_at)
                : "—"

              return (
                <li
                  key={install.entry_id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => (entry ? onOpenApp(entry) : onOpenInstall(install))}
                  >
                    <Cover
                      app={{
                        id: install.entry_id,
                        title: install.title,
                        thumbnail: entry?.thumbnail ?? "",
                      }}
                      className="size-12 shrink-0 rounded-field"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{install.title}</p>
                      <p className="truncate text-xs text-base-content/60">
                        v{install.version} · installed {installedAt}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    {updateAvailable ? (
                      <span className="badge badge-warning badge-sm">Update</span>
                    ) : entry ? (
                      <span className="badge badge-ghost badge-sm">Up to date</span>
                    ) : (
                      <span
                        className="badge badge-ghost badge-sm"
                        title="No longer listed on the server"
                      >
                        Local only
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-primary gap-2"
                      onClick={() => void launch(install)}
                      disabled={busy !== null}
                    >
                      {busy?.entryId === install.entry_id && busy.action === "launch" ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <PlayIcon width={14} height={14} />
                      )}
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-square"
                      aria-label={`Remove ${install.title}`}
                      onClick={() => {
                        setError(null)
                        setNotice(null)
                        setPendingRemove(install)
                      }}
                      disabled={busy !== null}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this application?"
        message={
          pendingRemove
            ? `${pendingRemove.title} and its files will be deleted from this computer. You can install it again from the Catalog.`
            : ""
        }
        confirmLabel="Remove"
        busy={busy?.action === "remove"}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
