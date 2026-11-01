import type { ReactNode } from "react"
import type { ThemeId, ViewId } from "../../types"
import { NavBar } from "./NavBar"

interface AppShellProps {
  activeView: ViewId
  serverUrl: string
  version: string
  theme: ThemeId
  onNavigate: (view: ViewId) => void
  onToggleTheme: () => void
  children: ReactNode
}

/**
 * Full-height application frame: a fixed top navbar, a scrollable content
 * region, and a thin status footer.
 */
export function AppShell({
  activeView,
  serverUrl,
  version,
  theme,
  onNavigate,
  onToggleTheme,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-base-100 text-base-content">
      <NavBar
        activeView={activeView}
        serverUrl={serverUrl}
        theme={theme}
        onNavigate={onNavigate}
        onToggleTheme={onToggleTheme}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-6">{children}</div>
      </main>

      <footer className="shrink-0 border-t border-base-300 bg-base-200 px-6 py-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/50">
          <span className="flex items-center gap-2">
            <span className="status status-success" />
            Connected
          </span>
          <span className="font-mono">{serverUrl}</span>
          <span className="ml-auto font-mono">v{version}</span>
        </div>
      </footer>
    </div>
  )
}
