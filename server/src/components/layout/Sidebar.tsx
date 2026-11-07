import type { ViewId } from "../../types"
import {
  CatalogIcon,
  DashboardIcon,
  FilesIcon,
  TransfersIcon,
} from "../icons"

interface SidebarProps {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
}

const navItems: { id: ViewId; label: string; icon: typeof DashboardIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { id: "catalog", label: "Catalog", icon: CatalogIcon },
  { id: "files", label: "Files", icon: FilesIcon },
  { id: "transfers", label: "Transfers", icon: TransfersIcon },
]

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-base-300 bg-base-200">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/logo.svg" alt="" className="size-10 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            CHU2CORE
          </p>
          <p className="truncate text-xs text-base-content/60">Server console</p>
        </div>
      </div>

      <div className="px-3">
        <div className="divider my-1 text-xs text-base-content/40">Manage</div>
      </div>

      <ul className="menu w-full gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            activeView === item.id ||
            (item.id === "catalog" && activeView === "entry")
          return (
            <li key={item.id}>
              <button
                type="button"
                className={isActive ? "menu-active" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto px-3 pb-4">
        <div className="rounded-box border border-base-300 bg-base-100 p-3">
          <div className="flex items-center gap-2">
            <span className="status status-success" />
            <span className="text-xs font-medium">Service online</span>
          </div>
          <p className="mt-1 text-xs text-base-content/60">
            LAN distribution active
          </p>
        </div>
      </div>
    </aside>
  )
}
