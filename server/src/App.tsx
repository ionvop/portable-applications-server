import { useCallback, useEffect, useState } from "react"
import "./App.css"
import {
  ApiError,
  getSystemInfo,
  listActivity,
  listEntries,
  listTransfers,
} from "./api/client"
import { AppShell } from "./components/layout/AppShell"
import { CatalogView } from "./views/CatalogView"
import { DashboardView } from "./views/DashboardView"
import { EntryDetailView } from "./views/EntryDetailView"
import { FilesView } from "./views/FilesView"
import { TransfersView } from "./views/TransfersView"
import type {
  ActivityItem,
  CatalogEntry,
  SystemInfo,
  Transfer,
  ViewId,
} from "./types"

/** Views that show live transfer data and therefore poll the server. */
const LIVE_VIEWS: ReadonlySet<ViewId> = new Set<ViewId>(["dashboard", "transfers"])

/** How often the live views refresh transfer and activity data. */
const POLL_INTERVAL_MS = 2000

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

/** Turn any thrown value into a message suitable for the error banner. */
function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.status}: ${cause.message}`
  if (cause instanceof Error) return cause.message
  return "Unable to reach the server."
}

function App() {
  const [view, setView] = useState<ViewId>("dashboard")
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      // Silent so the fatal path is reported once, by the Retry banner below,
      // instead of also stacking a toast for the same failure.
      const [info, catalog, transferRows, activityRows] = await Promise.all([
        getSystemInfo(true),
        listEntries(true),
        listTransfers(),
        listActivity(),
      ])
      if (signal?.aborted) return
      setSystemInfo(info)
      setEntries(catalog)
      setTransfers(transferRows)
      setActivity(activityRows)
    } catch (cause: unknown) {
      if (signal?.aborted) return
      setError(describeError(cause))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /**
   * Re-read the server snapshot behind the dashboard's headline stats.
   *
   * Failures are deliberately *not* rethrown: `request()` already reported them
   * to the global toast, and this runs from a fire-and-forget refresh where a
   * rejection would be unhandled.
   */
  const refreshSystemInfo = useCallback(async () => {
    try {
      setSystemInfo(await getSystemInfo())
    } catch {
      // Reported by the global ApiError toast.
    }
  }, [])

  /** Re-read the catalog without touching the global loading/error banner. */
  const refreshEntries = useCallback(async () => {
    try {
      const catalog = await listEntries()
      setEntries(catalog)
      setSelectedEntry((current) =>
        current ? (catalog.find((item) => item.id === current.id) ?? null) : null,
      )
    } catch {
      // Reported by the global ApiError toast.
    }
  }, [])

  /** Re-read transfers and the activity feed derived from them. */
  const refreshLiveData = useCallback(async () => {
    const [transferRows, activityRows] = await Promise.all([
      listTransfers(),
      listActivity(),
    ])
    setTransfers(transferRows)
    setActivity(activityRows)
  }, [])

  /**
   * Re-read every value a catalog mutation can change. The dashboard's entry
   * count lives on the system snapshot, the list on the catalog, and the feed
   * on the transfer tables, so all three are refreshed together.
   */
  const refreshAfterMutation = useCallback(async () => {
    try {
      await Promise.all([
        refreshSystemInfo(),
        refreshEntries(),
        refreshLiveData(),
      ])
    } catch {
      // The individual refreshes report their own errors; a failure here must
      // not stop the view from rendering the optimistic update.
    }
  }, [refreshEntries, refreshLiveData, refreshSystemInfo])

  // Poll only while a view that displays live transfer data is open. The first
  // tick runs immediately so switching views never shows rows that are up to
  // one interval out of date. Errors are ignored here so a transient failure
  // never replaces the loaded data.
  useEffect(() => {
    if (!LIVE_VIEWS.has(view)) return

    const tick = () => {
      void refreshLiveData().catch(() => {
        // Keep the last known data; the next tick retries.
      })
    }

    tick()
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [view, refreshLiveData])

  // Refresh the dashboard snapshot whenever it is opened. It is not polled:
  // every request walks the catalog table and probes the LAN address, so it is
  // read on demand instead of on every tick. Refreshing on entry keeps the
  // entry count correct when the catalog changed outside this app.
  useEffect(() => {
    if (view !== "dashboard") return

    let cancelled = false
    void Promise.all([getSystemInfo(), listEntries()])
      .then(([info, catalog]) => {
        if (cancelled) return
        setSystemInfo(info)
        setEntries(catalog)
      })
      .catch(() => {
        // Keep the last known data; the mutation refreshes and Retry cover the
        // failure path.
      })

    return () => {
      cancelled = true
    }
  }, [view])

  const navigate = (next: ViewId) => {
    // A failure banner belongs to the view that produced it; a background
    // refresh may have recovered by now, so it must not follow the user.
    setError(null)
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
    // Show the saved row immediately so the new entry is visible even if the
    // refetch below fails. Sorting matches the server's ORDER BY title
    // COLLATE NOCASE closely enough for the dashboard's recent list.
    setEntries((current) => {
      const next = current.some((item) => item.id === entry.id)
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [...current, entry]
      return next.sort((a, b) => a.title.localeCompare(b.title))
    })
    setSelectedEntry(entry)
    setIsCreating(false)
    setView("catalog")
    void refreshAfterMutation()
  }

  const handleDeleted = (id: number) => {
    setEntries((current) => current.filter((item) => item.id !== id))
    setSelectedEntry(null)
    setIsCreating(false)
    setView("catalog")
    void refreshAfterMutation()
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
              system={systemInfo}
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
