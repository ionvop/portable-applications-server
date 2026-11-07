import type { ConnectionState, ThemeId, ViewId } from "../../types"
import { describeConnection } from "../../lib/connection"
import {
  CatalogIcon,
  DownloadsIcon,
  LibraryIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "../icons"

interface NavBarProps {
  activeView: ViewId
  connection: ConnectionState
  serverUrl: string
  theme: ThemeId
  onNavigate: (view: ViewId) => void
  onToggleTheme: () => void
}

const navItems: { id: ViewId; label: string; icon: typeof CatalogIcon }[] = [
  { id: "catalog", label: "Catalog", icon: CatalogIcon },
  { id: "library", label: "Library", icon: LibraryIcon },
  { id: "downloads", label: "Downloads", icon: DownloadsIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
]

/** Sidebar-free shell navigation: brand, primary tabs, status and theme toggle. */
export function NavBar({
  activeView,
  connection,
  serverUrl,
  theme,
  onNavigate,
  onToggleTheme,
}: NavBarProps) {
  const status = describeConnection(connection)

  return (
    <header className="shrink-0 border-b border-base-300 bg-base-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
        <button
          type="button"
          className="flex items-center gap-3"
          onClick={() => onNavigate("catalog")}
          aria-label="Go to the catalog"
        >
          <img src="/logo.svg" alt="" className="size-10 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold leading-tight">CHU2PLAY</p>
            <p className="text-xs leading-tight text-base-content/60">Client</p>
          </div>
        </button>

        <ul className="menu menu-horizontal hidden gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon
            // The detail screen belongs to the catalog tab.
            const isActive =
              activeView === item.id || (item.id === "catalog" && activeView === "app")
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={isActive ? "menu-active" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <div
            className="hidden items-center gap-2 rounded-field bg-base-100 px-3 py-1.5 xl:flex"
            title={status.detail}
          >
            <span className={`status ${status.dot}`} />
            <span className="font-mono text-xs text-base-content/70">
              {serverUrl || status.label}
            </span>
          </div>

          <label className="swap swap-rotate btn btn-sm btn-ghost btn-circle">
            <input
              type="checkbox"
              checked={theme === "light"}
              onChange={onToggleTheme}
              aria-label="Toggle light theme"
            />
            <SunIcon className="swap-off" width={18} height={18} />
            <MoonIcon className="swap-on" width={18} height={18} />
          </label>
        </div>
      </div>

      {/* Compact screens keep navigation reachable without a sidebar. */}
      <div className="flex items-center gap-2 overflow-x-auto px-6 pb-3 md:hidden">
        <ul className="menu menu-horizontal gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              activeView === item.id || (item.id === "catalog" && activeView === "app")
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={isActive ? "menu-active" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon width={16} height={16} />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </header>
  )
}
