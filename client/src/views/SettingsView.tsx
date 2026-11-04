import { useState } from "react"
import type { ConnectionState, Settings, SystemInfo, ThemeId } from "../types"
import { ApiError, discoverServer, getSettings, testConnection, updateSettings } from "../api/client"
import { describeConnection } from "../lib/connection"
import { formatRelativeTime } from "../lib/format"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { CheckIcon, RefreshIcon, SearchIcon, ServerIcon, TrashIcon } from "../components/icons"

interface SettingsViewProps {
  system: SystemInfo
  settings: Settings
  connection: ConnectionState
  theme: ThemeId
  onToggleTheme: () => void
  /** Called with the authoritative settings after a save or a discovery. */
  onSettingsSaved: (settings: Settings) => void
  /** Deletes every install, cached cover and transfer record. */
  onResetStorage: () => Promise<{ removed: number }>
}

/** Which connection action is in flight, so only that button shows a spinner. */
type BusyAction = "save" | "discover" | "test" | "reset" | null

/** Turns any thrown value into text the UI can show. */
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}

/**
 * Connection and client info, rendered from the real `system` and `settings`
 * payloads.
 *
 * The address field is a controlled draft: `null` means "show the stored
 * value", so a successful save or discovery can drop the draft and let the
 * authoritative payload take over without an effect syncing state.
 */
export function SettingsView({
  system,
  settings,
  connection,
  theme,
  onToggleTheme,
  onSettingsSaved,
  onResetStorage,
}: SettingsViewProps) {
  const status = describeConnection(connection)

  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The reset card keeps its own outcome lines: a failed reset is unrelated to
  // the address field, and mixing them would clear one when the other runs.
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const value = draft ?? settings.server_url
  const dirty = draft !== null && draft.trim().replace(/\/+$/, "") !== settings.server_url

  /** Clear the previous outcome whenever the user edits the address. */
  const editAddress = (next: string) => {
    setDraft(next)
    setError(null)
    setNotice(null)
  }

  const save = async () => {
    setBusy("save")
    setError(null)
    setNotice(null)
    try {
      const saved = await updateSettings(value.trim())
      setDraft(null)
      onSettingsSaved(saved)
      setNotice(saved.server_url ? `Saved ${saved.server_url}.` : "Server address cleared.")
    } catch (cause) {
      setError(messageFor(cause, "The server address could not be saved."))
    } finally {
      setBusy(null)
    }
  }

  const discover = async () => {
    setBusy("discover")
    setError(null)
    setNotice(null)
    try {
      const reply = await discoverServer()
      // The backend persists the reply, so re-read it for `discovered_at`.
      const stored = await getSettings()
      setDraft(null)
      onSettingsSaved(stored)
      setNotice(`Found ${reply.app || "a server"} at ${reply.server_url}.`)
    } catch (cause) {
      setError(messageFor(cause, "No server was found on the local network."))
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy("test")
    setError(null)
    setNotice(null)
    try {
      const result = await testConnection(value.trim())
      setNotice(`The server at ${result.server_url} answered.`)
    } catch (cause) {
      setError(messageFor(cause, "The server did not answer."))
    } finally {
      setBusy(null)
    }
  }

  const reset = async () => {
    setBusy("reset")
    setResetError(null)
    setResetNotice(null)
    try {
      const result = await onResetStorage()
      setConfirmingReset(false)
      setResetNotice(
        result.removed === 0
          ? "There was nothing to remove."
          : `Removed ${result.removed} application${result.removed === 1 ? "" : "s"} and the cached files.`,
      )
    } catch (cause) {
      setResetError(messageFor(cause, "The local storage could not be reset."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="card-title text-sm">Server connection</h2>
              <p className="mt-1 text-xs text-base-content/60">
                Point the client at the computer hosting the Portable Applications Server.
              </p>
            </div>
            <span className={`badge ${status.badge} badge-sm gap-1`}>
              <span className={`status ${status.dot}`} />
              {status.label}
            </span>
          </div>

          <p className="text-xs text-base-content/60">{status.detail}</p>

          <fieldset className="fieldset">
            <legend className="fieldset-legend text-xs">Server address</legend>
            <input
              type="url"
              className="input input-sm w-full font-mono"
              value={value}
              onChange={(event) => editAddress(event.target.value)}
              placeholder="http://192.168.1.10:8756"
              aria-label="Server address"
              disabled={busy !== null}
            />
            <p className="label text-xs text-base-content/50">
              {settings.discovered_at
                ? `Last discovered ${formatRelativeTime(settings.discovered_at)}.`
                : "Leave blank to search the local network automatically."}
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary gap-2"
              onClick={() => void save()}
              disabled={busy !== null || !dirty}
            >
              {busy === "save" ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <CheckIcon width={16} height={16} />
              )}
              Save
            </button>
            <button
              type="button"
              className="btn btn-sm gap-2"
              onClick={() => void discover()}
              disabled={busy !== null}
            >
              {busy === "discover" ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <SearchIcon width={16} height={16} />
              )}
              Discover on LAN
            </button>
            <button
              type="button"
              className="btn btn-sm gap-2"
              onClick={() => void test()}
              disabled={busy !== null}
            >
              {busy === "test" ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <RefreshIcon width={16} height={16} />
              )}
              Test connection
            </button>
            {dirty && busy === null && (
              <span className="ml-auto text-xs text-base-content/40">Unsaved changes</span>
            )}
          </div>

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

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-3">
            <h2 className="card-title text-sm">Client</h2>
            <dl className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-base-content/60">Application</dt>
                <dd className="text-right">{system.app_name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-base-content/60">Version</dt>
                <dd className="font-mono">{system.version}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-base-content/60">Interface</dt>
                <dd className="font-mono">
                  {system.ui_host}:{system.port}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-base-content/60">Installed apps</dt>
                <dd className="font-mono">{system.installed_count}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-3">
            <h2 className="card-title text-sm">Storage</h2>
            <p className="text-xs text-base-content/60">
              Paths are resolved relative to the client's own folder, so the app stays portable.
            </p>
            <div className="rounded-field bg-base-100 px-3 py-2">
              <p className="text-xs text-base-content/40">Data directory</p>
              <p className="truncate font-mono text-xs">{system.data_dir}</p>
            </div>
            <div className="rounded-field bg-base-100 px-3 py-2">
              <p className="text-xs text-base-content/40">Applications directory</p>
              <p className="truncate font-mono text-xs">{system.apps_dir}</p>
            </div>
            <p className="text-xs text-base-content/50">
              {system.installed_count === 0
                ? "No applications are stored yet."
                : `${system.installed_count} application${system.installed_count === 1 ? "" : "s"} stored in this directory.`}
            </p>
          </div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-3">
          <h2 className="card-title text-sm">Appearance</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="swap swap-rotate btn btn-sm btn-ghost btn-circle">
              <input
                type="checkbox"
                checked={theme === "light"}
                onChange={onToggleTheme}
                aria-label="Toggle light theme"
              />
              <span className="swap-off text-xs">Dark</span>
              <span className="swap-on text-xs">Light</span>
            </label>
            <span className="text-xs text-base-content/60">
              Switch between the dark and light interface.
            </span>
          </div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <ServerIcon width={18} height={18} className="text-base-content/50" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Reset local storage</p>
              <p className="text-xs text-base-content/60">
                Removes downloaded apps, cached covers and transfer history from this computer.
                The server address is kept.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-error btn-outline gap-2"
              onClick={() => {
                setResetError(null)
                setResetNotice(null)
                setConfirmingReset(true)
              }}
              disabled={busy !== null}
            >
              {busy === "reset" ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <TrashIcon width={14} height={14} />
              )}
              Reset local storage
            </button>
          </div>

          {resetError && (
            <p role="alert" className="text-xs text-error">
              {resetError}
            </p>
          )}
          {resetNotice && !resetError && (
            <p role="status" className="text-xs text-success">
              {resetNotice}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        title="Reset local storage?"
        message={
          system.installed_count === 0
            ? "No applications are installed. The cached covers and transfer history will still be cleared."
            : `All ${system.installed_count} installed application${system.installed_count === 1 ? "" : "s"}, their files, the cached covers and the transfer history will be deleted from this computer. They can be installed again from the Store.`
        }
        confirmLabel="Reset"
        busy={busy === "reset"}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  )
}
