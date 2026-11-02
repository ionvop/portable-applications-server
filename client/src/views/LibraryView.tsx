import type { CatalogApp, Install } from "../types"
import { Cover } from "../components/Cover"
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
}: LibraryViewProps) {
  const catalogById = new Map(catalog.map((app) => [app.id, app]))

  /** The catalog entry for an install, when the server still lists it. */
  const entryFor = (install: Install) => catalogById.get(install.entry_id)

  const updates = installs.filter((install) => entryFor(install)?.update_available)

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
            Browse the store
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
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
                    <button type="button" className="btn btn-sm btn-primary gap-2">
                      <PlayIcon width={14} height={14} />
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-square"
                      aria-label={`Remove ${install.title}`}
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
    </div>
  )
}
