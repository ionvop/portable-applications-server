import type { ViewId } from "../../types"
import { MoonIcon, SunIcon } from "../icons"

interface TopBarProps {
  title: string
  subtitle: string
  lanIp: string
  port: number
  onNavigate: (view: ViewId) => void
}

export function TopBar({ title, subtitle, lanIp, port, onNavigate }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-base-300 bg-base-100 px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        <p className="truncate text-xs text-base-content/60">{subtitle}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="btn btn-sm btn-ghost gap-2 font-mono text-xs"
          onClick={() => onNavigate("dashboard")}
        >
          <span className="status status-success" />
          {lanIp}:{port}
        </button>

        <label className="swap swap-rotate btn btn-sm btn-ghost btn-circle">
          <input type="checkbox" className="theme-controller" value="light" />
          <SunIcon className="swap-off" width={18} height={18} />
          <MoonIcon className="swap-on" width={18} height={18} />
        </label>
      </div>
    </header>
  )
}
