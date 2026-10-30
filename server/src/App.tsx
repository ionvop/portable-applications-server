import { useEffect, useState } from "react"
import "./App.css"
import { ApiError, getSystemInfo, listEntries } from "./api/client"
import { AppShell } from "./components/layout/AppShell"
import { CatalogView } from "./views/CatalogView"
import { DashboardView } from "./views/DashboardView"
import { EntryDetailView } from "./views/EntryDetailView"
import { FilesView } from "./views/FilesView"
import { TransfersView } from "./views/TransfersView"
import {
  activity,
  catalogEntries,
  systemInfo,
  transfers,
} from "./data/mockData"
import type { CatalogEntry, ViewId } from "./types"

const pageMeta: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Server overview and recent activity",
  },
  catalog: {
    title: "Catalog",
    subtitle: "Applications and games available to clients",
  },
  entry: {
    title: "Catalog entry",
    subtitle: "Edit metadata and distribution settings",
  },
  files: {
    title: "Files",
    subtitle: "Browse the managed application storage",
  },
  transfers: {
    title: "Transfers",
    subtitle: "ZIP distribution activity across the local network",
  },
}

function App() {
  const [view, setView] = useState<ViewId>("dashboard")
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null)

  // Temporary Step 2 verification: log real data from SQLite. Removed in Step 3.
  useEffect(() => {
    let cancelled = false
    Promise.all([getSystemInfo(), listEntries()])
      .then(([info, entries]) => {
        if (cancelled) return
        console.log("[api] system info:", info)
        console.log(`[api] ${entries.length} catalog entries:`, entries)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError) {
          console.error(`[api] ${error.status}: ${error.message}`)
        } else {
          console.error("[api] request failed:", error)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const navigate = (next: ViewId) => {
    if (next !== "entry") {
      setSelectedEntry(null)
    }
    setView(next)
  }

  const openEntry = (entry: CatalogEntry) => {
    setSelectedEntry(entry)
    setView("entry")
  }

  const meta = pageMeta[view]

  return (
    <AppShell
      activeView={view}
      title={meta.title}
      subtitle={meta.subtitle}
      lanIp={systemInfo.lan_ip}
      port={systemInfo.port}
      version={systemInfo.version}
      onNavigate={navigate}
    >
      {view === "dashboard" && (
        <DashboardView
          system={systemInfo}
          entries={catalogEntries}
          transfers={transfers}
          activity={activity}
          onOpenCatalog={() => navigate("catalog")}
          onOpenEntry={openEntry}
          onOpenFiles={() => navigate("files")}
          onOpenTransfers={() => navigate("transfers")}
        />
      )}

      {view === "catalog" && (
        <CatalogView entries={catalogEntries} onOpenEntry={openEntry} />
      )}

      {view === "entry" && selectedEntry && (
        <EntryDetailView
          entry={selectedEntry}
          onBack={() => navigate("catalog")}
        />
      )}

      {view === "files" && <FilesView />}

      {view === "transfers" && <TransfersView transfers={transfers} />}
    </AppShell>
  )
}

export default App
