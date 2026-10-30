import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { ApiError, getSystemInfo, listEntries } from "./api/client"
import { AppShell } from "./components/layout/AppShell"
import { CatalogView } from "./views/CatalogView"
import { DashboardView } from "./views/DashboardView"
import { EntryDetailView } from "./views/EntryDetailView"
import { FilesView } from "./views/FilesView"
import { TransfersView } from "./views/TransfersView"
// Transfers and activity have no backend endpoints yet (Step 6).
import { activity, transfers } from "./data/mockData"
import type { CatalogEntry, SystemInfo, ViewId } from "./types"

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
  const [isCreating, setIsCreating] = useState(false)

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const [info, catalog] = await Promise.all([
        getSystemInfo(),
        listEntries(),
      ])
      if (signal?.aborted) return
      setSystemInfo(info)
      setEntries(catalog)
    } catch (cause: unknown) {
      if (signal?.aborted) return
      setError(
        cause instanceof ApiError
          ? `${cause.status}: ${cause.message}`
          : cause instanceof Error
            ? cause.message
            : "Unable to reach the server.",
      )
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /** Re-read the catalog without touching the global loading/error banner. */
  const refreshEntries = useCallback(async () => {
    try {
      const catalog = await listEntries()
      setEntries(catalog)
      setSelectedEntry((current) =>
        current ? (catalog.find((item) => item.id === current.id) ?? null) : null,
      )
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? `${cause.status}: ${cause.message}`
          : cause instanceof Error
            ? cause.message
            : "Unable to reach the server.",
      )
    }
  }, [])

  const navigate = (next: ViewId) => {
    if (next !== "entry") {
      setSelectedEntry(null)
      setIsCreating(false)
    }
    setView(next)
  }

  const openEntry = (entry: CatalogEntry) => {
    setIsCreating(false)
    setSelectedEntry(entry)
    setView("entry")
  }

  const openCreate = () => {
    setSelectedEntry(null)
    setIsCreating(true)
    setView("entry")
  }

  const handleSaved = (entry: CatalogEntry) => {
    setSelectedEntry(entry)
    setIsCreating(false)
    setView("catalog")
    void refreshEntries()
  }

  const handleDeleted = (id: number) => {
    setEntries((current) => current.filter((item) => item.id !== id))
    setSelectedEntry(null)
    setIsCreating(false)
    setView("catalog")
    void refreshEntries()
  }

  const meta = pageMeta[view]

  return (
    <AppShell
      activeView={view}
      title={meta.title}
      subtitle={meta.subtitle}
      lanIp={systemInfo?.lan_ip ?? "—"}
      port={systemInfo?.port ?? 0}
      version={systemInfo?.version ?? ""}
      onNavigate={navigate}
    >
      {error && (
        <div role="alert" className="alert alert-error mx-auto mb-5 max-w-6xl">
          <span className="text-sm">Could not load server data — {error}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !systemInfo ? (
        <div className="grid place-items-center py-24">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : (
        <>
          {view === "dashboard" && systemInfo && (
            <DashboardView
              system={systemInfo}
              entries={entries}
              transfers={transfers}
              activity={activity}
              onOpenCatalog={() => navigate("catalog")}
              onOpenEntry={openEntry}
              onOpenFiles={() => navigate("files")}
              onOpenTransfers={() => navigate("transfers")}
            />
          )}

          {view === "catalog" && (
            <CatalogView
              entries={entries}
              onOpenEntry={openEntry}
              onCreate={openCreate}
              onDeleted={handleDeleted}
            />
          )}

          {view === "entry" && (selectedEntry || isCreating) && (
            <EntryDetailView
              key={selectedEntry ? `entry-${selectedEntry.id}` : "entry-new"}
              entry={selectedEntry}
              onBack={() => navigate("catalog")}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onRefresh={refreshEntries}
            />
          )}

          {view === "files" && <FilesView />}

          {view === "transfers" && <TransfersView transfers={transfers} />}
        </>
      )}
    </AppShell>
  )
}

export default App
