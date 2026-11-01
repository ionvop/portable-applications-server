import type { CatalogApp } from "../types"
import { Cover } from "../components/Cover"
import { formatBytes } from "../lib/format"
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  PlayIcon,
  RefreshIcon,
  SizeIcon,
  TimeIcon,
} from "../components/icons"

interface AppDetailViewProps {
  app: CatalogApp
  onBack: () => void
}

/**
 * Detail screen for a single catalog entry. Every action here is inert: the
 * prototype only demonstrates layout and affordance placement.
 */
export function AppDetailView({ app, onBack }: AppDetailViewProps) {
  const primaryLabel = app.update_available
    ? "Update"
    : app.installed
      ? "Play"
      : "Install"
  const PrimaryIcon = app.update_available
    ? RefreshIcon
    : app.installed
      ? PlayIcon
      : DownloadIcon

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={onBack}>
          <ArrowLeftIcon width={16} height={16} />
          Back to store
        </button>
        <div className="breadcrumbs py-0 text-xs">
          <ul>
            <li>
              <button type="button" className="link link-hover" onClick={onBack}>
                Store
              </button>
            </li>
            <li>{app.title}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Cover app={app} large className="h-56 w-full rounded-box" />

          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-tight">{app.title}</h2>
                  <p className="mt-1 text-xs text-base-content/60">
                    {app.category === "games" ? "Game" : "Application"} ·{" "}
                    <span className="font-mono">v{app.version}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {app.update_available && (
                    <span className="badge badge-warning badge-sm">Update available</span>
                  )}
                  {app.installed && (
                    <span className="badge badge-success badge-sm gap-1">
                      <CheckIcon width={12} height={12} />
                      Installed
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm leading-relaxed text-base-content/70">{app.description}</p>

              <div className="flex flex-wrap items-center gap-2 border-t border-base-300 pt-4">
                <button type="button" className="btn btn-primary gap-2">
                  <PrimaryIcon width={16} height={16} />
                  {primaryLabel}
                </button>
                {app.installed && (
                  <button type="button" className="btn gap-2">
                    <RefreshIcon width={16} height={16} />
                    Verify files
                  </button>
                )}
                <span className="ml-auto text-xs text-base-content/40">
                  Prototype — actions do not download or launch.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h3 className="card-title text-sm">Details</h3>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-base-content/60">
                    <SizeIcon width={14} height={14} />
                    Download size
                  </dt>
                  <dd className="font-mono">{formatBytes(app.size_bytes)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60">Version</dt>
                  <dd className="font-mono">{app.version}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60">Installed version</dt>
                  <dd className="font-mono">{app.installed_version || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-base-content/60">
                    <TimeIcon width={14} height={14} />
                    Updated
                  </dt>
                  <dd className="font-mono">{app.updated_at.slice(0, 10)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h3 className="card-title text-sm">Local install</h3>
              <p className="text-xs text-base-content/60">
                Files are extracted into the client's managed storage directory.
              </p>
              <div className="rounded-field bg-base-100 px-3 py-2">
                <p className="text-xs text-base-content/40">Executable</p>
                <p className="truncate font-mono text-xs">{app.executable}</p>
              </div>
              <div className="rounded-field bg-base-100 px-3 py-2">
                <p className="text-xs text-base-content/40">Directory</p>
                <p className="truncate font-mono text-xs">
                  data\apps\{app.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
