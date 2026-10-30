import type { ReactNode } from "react"
import type { ViewId } from "../../types"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"

interface AppShellProps {
  activeView: ViewId
  title: string
  subtitle: string
  lanIp: string
  port: number
  version: string
  onNavigate: (view: ViewId) => void
  children: ReactNode
}

export function AppShell({
  activeView,
  title,
  subtitle,
  lanIp,
  port,
  version,
  onNavigate,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full bg-base-100 text-base-content">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        version={version}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          subtitle={subtitle}
          lanIp={lanIp}
          port={port}
          onNavigate={onNavigate}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
