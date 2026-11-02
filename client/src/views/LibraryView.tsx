import type { CatalogApp } from "../types"
import { Cover } from "../components/Cover"
import { DownloadIcon, LibraryIcon, PlayIcon, TrashIcon } from "../components/icons"

interface LibraryViewProps {
  apps: CatalogApp[]
  onOpenApp: (app: CatalogApp) => void
  onBrowse: () => void
}

/** Installed applications, with update and removal affordances. */
export function LibraryView({ apps, onOpenApp, onBrowse }: LibraryViewProps) {
  const installed = apps.filter((app) => app.installed)
  const updates = installed.filter((app) => app.update_available)

  if (installed.length === 0) {
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
          <div className="stat-value text-2xl">{installed.length}</div>
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
          <div className="stat-value text-2xl">
            {installed.filter((app) => !app.update_available).length}
          </div>
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
            {installed.map((app) => (
              <li key={app.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpenApp(app)}
                >
                  <Cover app={app} className="size-12 shrink-0 rounded-field" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{app.title}</p>
                    <p className="truncate text-xs text-base-content/60">
                      v{app.installed_version}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {app.update_available ? (
                    <span className="badge badge-warning badge-sm">Update</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm">Up to date</span>
                  )}
                  <button type="button" className="btn btn-sm btn-primary gap-2">
                    <PlayIcon width={14} height={14} />
                    Play
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    aria-label={`Remove ${app.title}`}
                  >
                    <TrashIcon width={16} height={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
