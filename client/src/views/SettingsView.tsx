import type { SystemInfo, ThemeId } from "../types"
import { CheckIcon, RefreshIcon, SearchIcon, ServerIcon } from "../components/icons"

interface SettingsViewProps {
  system: SystemInfo
  theme: ThemeId
  onToggleTheme: () => void
}

/**
 * Connection and client info. Inputs and buttons are intentionally inert;
 * nothing is saved and no discovery request is made.
 */
export function SettingsView({ system, theme, onToggleTheme }: SettingsViewProps) {
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
            <span className="badge badge-success badge-sm gap-1">
              <span className="status status-success" />
              Connected
            </span>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend text-xs">Server address</legend>
            <input
              type="url"
              className="input input-sm w-full font-mono"
              defaultValue={system.server_url}
              placeholder="http://192.168.1.10:8756"
              aria-label="Server address"
            />
            <p className="label text-xs text-base-content/50">
              Leave blank to search the local network automatically.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm btn-primary gap-2">
              <SearchIcon width={16} height={16} />
              Discover on LAN
            </button>
            <button type="button" className="btn btn-sm gap-2">
              <RefreshIcon width={16} height={16} />
              Test connection
            </button>
            <span className="ml-auto text-xs text-base-content/40">
              Prototype — nothing is saved.
            </span>
          </div>
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
            <progress className="progress progress-primary h-1.5" value={42} max={100} />
            <p className="text-xs text-base-content/50">42% of the local storage quota in use.</p>
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
        <div className="card-body flex-row flex-wrap items-center gap-3">
          <ServerIcon width={18} height={18} className="text-base-content/50" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Reset local storage</p>
            <p className="text-xs text-base-content/60">
              Removes downloaded apps and cached metadata from this computer.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-error btn-outline gap-2" disabled>
            <CheckIcon width={14} height={14} />
            Unavailable in prototype
          </button>
        </div>
      </div>
    </div>
  )
}
