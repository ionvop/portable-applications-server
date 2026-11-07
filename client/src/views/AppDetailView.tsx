import { useState } from "react"
import type { CatalogApp, Install, Job, LaunchResult } from "../types"
import { ApiError } from "../api/client"
import { Cover } from "../components/Cover"
import { JobProgress } from "../components/JobProgress"
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  PlayIcon,
  RefreshIcon,
} from "../components/icons"

interface AppDetailViewProps {
  app: CatalogApp
  /** The install row for this entry, when it is installed on this machine. */
  install?: Install
  /** The running install job for this entry, if one is in flight. */
  job?: Job
  onBack: () => void
  /** Starts an install; `force` re-downloads even when the version matches. */
  onInstall: (force: boolean) => Promise<Job>
  onLaunch: () => Promise<LaunchResult>
}

/** Which action is in flight, so only that button shows a spinner. */
type BusyAction = "install" | "verify" | "launch" | null

/** Turns any thrown value into text the UI can show. */
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}

/**
 * Detail screen for a single catalog entry.
 *
 * The primary action follows the install state: an entry that is current
 * launches, anything else installs (or updates). `Verify files` forces a
 * re-download, which repairs a damaged install as well as picking up a newer
 * build. Progress for the resulting job is rendered inline, so the user does
 * not have to switch to Downloads to watch it.
 */
export function AppDetailView({
  app,
  install,
  job,
  onBack,
  onInstall,
  onLaunch,
}: AppDetailViewProps) {
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const current = app.installed && !app.update_available
  const installing = job !== undefined

  const primaryLabel = app.update_available ? "Update" : current ? "Play" : "Install"
  const PrimaryIcon = app.update_available ? RefreshIcon : current ? PlayIcon : DownloadIcon

  const runInstall = async (force: boolean) => {
    setBusy(force ? "verify" : "install")
    setError(null)
    setNotice(null)
    try {
      const started = await onInstall(force)
      setNotice(
        force
          ? `Verifying ${app.title} — the files are being downloaded again.`
          : `Installing ${app.title}…`,
      )
      // A job that is already terminal (the entry was current) never shows a
      // bar, so say so instead of leaving the user waiting for one.
      if (started.status === "completed") setNotice(`${app.title} is already up to date.`)
      if (started.status === "failed") setError(started.error || "The install failed.")
    } catch (cause) {
      setError(messageFor(cause, "The install could not be started."))
    } finally {
      setBusy(null)
    }
  }

  const runLaunch = async () => {
    setBusy("launch")
    setError(null)
    setNotice(null)
    try {
      const result = await onLaunch()
      setNotice(`Started ${app.title} (pid ${result.pid}).`)
    } catch (cause) {
      setError(messageFor(cause, "The application could not be started."))
    } finally {
      setBusy(null)
    }
  }

  const primary = () => {
    if (current) return void runLaunch()
    return void runInstall(false)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={onBack}>
          <ArrowLeftIcon width={16} height={16} />
          Back to catalog
        </button>
        <div className="breadcrumbs py-0 text-xs">
          <ul>
            <li>
              <button type="button" className="link link-hover" onClick={onBack}>
                Catalog
              </button>
            </li>
            <li>{app.title}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Cover app={app} large className="h-56 w-full rounded-box" />

          <div className="card border border-base-300 surface">
            <div className="card-body gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-tight">{app.title}</h2>
                  <p className="mt-1 text-xs text-base-content/60">
                    {app.installed ? "Installed on this computer" : "Available from the server"}
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
                <button
                  type="button"
                  className="btn btn-primary gap-2"
                  onClick={primary}
                  disabled={busy !== null || installing}
                >
                  {busy === "install" || busy === "launch" ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <PrimaryIcon width={16} height={16} />
                  )}
                  {primaryLabel}
                </button>
                {app.installed && (
                  <button
                    type="button"
                    className="btn gap-2"
                    onClick={() => void runInstall(true)}
                    disabled={busy !== null || installing}
                  >
                    {busy === "verify" ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <RefreshIcon width={16} height={16} />
                    )}
                    Verify files
                  </button>
                )}
                {installing && (
                  <span className="ml-auto text-xs text-base-content/40">
                    A transfer for this app is already running.
                  </span>
                )}
              </div>

              {job && (
                <div className="rounded-field bg-base-100/60 px-3 py-3">
                  <JobProgress job={job} />
                </div>
              )}

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
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card border border-base-300 surface">
            <div className="card-body gap-3">
              <h3 className="card-title text-sm">Details</h3>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60">Installed version</dt>
                  <dd className="font-mono">{app.installed_version || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60">Available version</dt>
                  <dd className="font-mono">{app.version || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-base-content/60">Status</dt>
                  <dd className="font-mono">
                    {app.update_available
                      ? "Update available"
                      : app.installed
                        ? "Up to date"
                        : "Not installed"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="card border border-base-300 surface">
            <div className="card-body gap-3">
              <h3 className="card-title text-sm">Local install</h3>
              <p className="text-xs text-base-content/60">
                Files are extracted into the client's managed storage directory.
              </p>
              <div className="rounded-field bg-base-100/60 px-3 py-2">
                <p className="text-xs text-base-content/40">Executable</p>
                <p className="truncate font-mono text-xs" title={install?.executable}>
                  {install?.executable || "—"}
                </p>
              </div>
              <div className="rounded-field bg-base-100/60 px-3 py-2">
                <p className="text-xs text-base-content/40">Directory</p>
                <p className="truncate font-mono text-xs" title={install?.directory}>
                  {install?.directory || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
