import type { ReactNode } from "react"
import type { ViewId } from "../../types"
import { CloseGuard } from "../CloseGuard"
import { Toaster } from "../Toaster"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"

interface AppShellProps {
  activeView: ViewId
  title: string
  subtitle: string
  lanIp: string
  port: number
  onNavigate: (view: ViewId) => void
  children: ReactNode
}

export function AppShell({
  activeView,
  title,
  subtitle,
  lanIp,
  port,
  onNavigate,
  children,
}: AppShellProps) {
  return (
    // No `bg-base-100` here: the body paints the solid colour and the fixed
    // character backdrop sits between it and this shell.
    <div className="flex h-full text-base-content">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
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
      <Toaster />
      <CloseGuard />
    </div>
  )
}
