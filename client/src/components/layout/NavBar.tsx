import type { ConnectionState, ThemeId, ViewId } from "../../types"
import { describeConnection } from "../../lib/connection"
import {
  DownloadsIcon,
  GamepadIcon,
  LibraryIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  StoreIcon,
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

const navItems: { id: ViewId; label: string; icon: typeof StoreIcon }[] = [
  { id: "catalog", label: "Store", icon: StoreIcon },
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
          aria-label="Go to the store"
        >
          <div className="grid size-10 place-items-center rounded-box bg-primary text-primary-content">
            <GamepadIcon width={22} height={22} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold leading-tight">Portable Apps</p>
            <p className="text-xs leading-tight text-base-content/60">Client</p>
          </div>
        </button>

        <ul className="menu menu-horizontal hidden gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon
            // The detail screen belongs to the store tab.
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
          <label className="input input-sm hidden w-56 lg:flex">
            <SearchIcon width={16} height={16} className="opacity-50" />
            <input type="search" placeholder="Search apps…" aria-label="Search apps" />
          </label>

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

          <div className="avatar avatar-placeholder">
            <div className="w-8 rounded-full bg-neutral text-neutral-content">
              <span className="text-xs">PC</span>
            </div>
          </div>
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
