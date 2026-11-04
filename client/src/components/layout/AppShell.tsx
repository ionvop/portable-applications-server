import type { ReactNode } from "react"
import type { ConnectionState, ThemeId, ViewId } from "../../types"
import { describeConnection } from "../../lib/connection"
import { ErrorBanner } from "../ErrorBanner"
import { NavBar } from "./NavBar"

interface AppShellProps {
  activeView: ViewId
  connection: ConnectionState
  serverUrl: string
  version: string
  theme: ThemeId
  /** Latest shell-level failure, or `null` when there is nothing to report. */
  error?: string | null
  onDismissError?: () => void
  onRetryError?: () => void
  onNavigate: (view: ViewId) => void
  onToggleTheme: () => void
  children: ReactNode
}

/**
 * Full-height application frame: a fixed top navbar, an optional error banner,
 * a scrollable content region, and a thin status footer.
 */
export function AppShell({
  activeView,
  connection,
  serverUrl,
  version,
  theme,
  error = null,
  onDismissError,
  onRetryError,
  onNavigate,
  onToggleTheme,
  children,
}: AppShellProps) {
  const status = describeConnection(connection)

  return (
    <div className="flex h-full flex-col bg-base-100 text-base-content">
      <NavBar
        activeView={activeView}
        connection={connection}
        serverUrl={serverUrl}
        theme={theme}
        onNavigate={onNavigate}
        onToggleTheme={onToggleTheme}
      />

      {error && onDismissError && (
        <ErrorBanner message={error} onDismiss={onDismissError} onRetry={onRetryError} />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-6">{children}</div>
      </main>

      <footer className="shrink-0 border-t border-base-300 bg-base-200 px-6 py-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/50">
          <span className="flex items-center gap-2">
            <span className={`status ${status.dot}`} />
            {status.label}
          </span>
          <span className="font-mono">{serverUrl || "no server configured"}</span>
          <span className="ml-auto font-mono">v{version}</span>
        </div>
      </footer>
    </div>
  )
}
