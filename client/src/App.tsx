import { useCallback, useEffect, useRef, useState } from "react"
import "./App.css"
import type {
  CatalogApp,
  ConnectionState,
  Install,
  Job,
  Settings,
  SystemInfo,
  ThemeId,
  ViewId,
} from "./types"
import {
  ApiError,
  getCatalog,
  getInstalled,
  getJobs,
  getSettings,
  getSystemInfo,
  installApp,
  launchApp,
  removeApp,
} from "./api/client"
import { hasActiveJobs, isActiveJob } from "./lib/jobs"
import { AppShell } from "./components/layout/AppShell"
import { ErrorNotice } from "./components/ErrorNotice"
import { CatalogView } from "./views/CatalogView"
import { AppDetailView } from "./views/AppDetailView"
import { LibraryView } from "./views/LibraryView"
import { DownloadsView } from "./views/DownloadsView"
import { SettingsView } from "./views/SettingsView"

/** Page heading shown above each screen. The detail view brings its own. */
const pageMeta: Record<ViewId, { title: string; subtitle: string }> = {
  catalog: {
    title: "Store",
    subtitle: "Games and applications available on the local network",
  },
  app: { title: "App details", subtitle: "Install and launch this application" },
  library: {
    title: "Library",
    subtitle: "Everything installed on this computer, ready to launch",
  },
  downloads: {
    title: "Downloads",
    subtitle: "Transfer progress for applications coming from the server",
  },
  settings: {
    title: "Settings",
    subtitle: "Server connection, storage, and appearance",
  },
}

/** Turns any thrown value into text the UI can show. */
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}

function App() {
  const [view, setView] = useState<ViewId>("catalog")
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null)
  const [theme, setTheme] = useState<ThemeId>("night")

  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [catalog, setCatalog] = useState<CatalogApp[]>([])
  const [installs, setInstalls] = useState<Install[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])

  const [loading, setLoading] = useState(true)
  /** The client backend itself is down — nothing can be rendered. */
  const [systemError, setSystemError] = useState<string | null>(null)
  /** The backend is up but the server catalog could not be fetched. */
  const [catalogError, setCatalogError] = useState<string | null>(null)

  // Guards against a stale response overwriting a newer one (StrictMode mounts
  // the effect twice, and Retry can fire while a load is still in flight).
  const requestId = useRef(0)

  // Job ids that were running at the last poll. A job that disappears from this
  // set has finished, which is the cue to refresh the Library and the Store.
  const activeJobIds = useRef<Set<number>>(new Set())

  // daisyUI reads the theme from the document element, so mirror state there.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  /**
   * Fetch everything the shell needs. State is only written after an `await`,
   * so mounting the effect never triggers a synchronous cascading render.
   */
  const load = useCallback(async () => {
    const id = ++requestId.current

    // The client's own API is the gate: without it there is nothing to show.
    let info: SystemInfo
    try {
      info = await getSystemInfo()
    } catch (cause) {
      if (id !== requestId.current) return
      setSystemError(messageFor(cause, "Could not reach the client backend."))
      setLoading(false)
      return
    }
    if (id !== requestId.current) return
    setSystem(info)

    // The catalog needs a server address; without one the request is pointless.
    const catalogRequest: Promise<CatalogApp[]> = info.server_url
      ? getCatalog()
      : Promise.reject(
          new ApiError(
            "No server address is configured. Set one in Settings or discover a server on the LAN.",
            0,
          ),
        )

    const [catalogResult, installsResult, settingsResult, jobsResult] =
      await Promise.allSettled([catalogRequest, getInstalled(), getSettings(), getJobs()])
    if (id !== requestId.current) return

    if (catalogResult.status === "fulfilled") {
      setCatalog(catalogResult.value)
    } else {
      setCatalog([])
      setCatalogError(messageFor(catalogResult.reason, "Could not load the catalog."))
    }

    // Installs, settings and jobs are local, so a failure here is unexpected
    // but not fatal: degrade to empty rather than blanking the whole shell.
    setInstalls(installsResult.status === "fulfilled" ? installsResult.value : [])
    setSettings(settingsResult.status === "fulfilled" ? settingsResult.value : null)

    const initialJobs = jobsResult.status === "fulfilled" ? jobsResult.value : []
    activeJobIds.current = new Set(initialJobs.filter(isActiveJob).map((job) => job.id))
    setJobs(initialJobs)

    setLoading(false)
  }, [])

  useEffect(() => {
    // `load` only writes state after its first `await`, so this cannot cascade
    // a synchronous render; the rule cannot see through the async boundary.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  /**
   * Re-read the local install list and the catalog after an install finishes,
   * so the Library gains the app and the Store flips to "Installed" without a
   * manual reload.
   */
  const refreshAfterInstall = useCallback(async () => {
    const [installsResult, catalogResult] = await Promise.allSettled([
      getInstalled(),
      getCatalog(),
    ])
    if (installsResult.status === "fulfilled") setInstalls(installsResult.value)
    if (catalogResult.status === "fulfilled") {
      setCatalog(catalogResult.value)
      setCatalogError(null)
    }
  }, [])

  /**
   * Poll the job list. A job that was running at the previous poll and is gone
   * now has finished, which triggers the post-install refresh.
   */
  const refreshJobs = useCallback(async () => {
    let next: Job[]
    try {
      next = await getJobs()
    } catch {
      // A failed poll is transient; the next tick tries again.
      return
    }

    const current = new Set(next.filter(isActiveJob).map((job) => job.id))
    const finished = [...activeJobIds.current].filter((id) => !current.has(id))
    activeJobIds.current = current
    setJobs(next)

    if (finished.length > 0) void refreshAfterInstall()
  }, [refreshAfterInstall])

  // Only poll while something is actually running: an idle client makes no
  // requests at all.
  const jobsRunning = hasActiveJobs(jobs)
  useEffect(() => {
    if (!jobsRunning) return
    const timer = setInterval(() => {
      void refreshJobs()
    }, 1000)
    return () => clearInterval(timer)
  }, [jobsRunning, refreshJobs])

  /** Re-run the load from a clean slate, used by the error cards' Retry. */
  const retry = () => {
    setLoading(true)
    setSystemError(null)
    setCatalogError(null)
    void load()
  }

  /**
   * Connection state is derived, not probed: an empty address means nothing is
   * configured, a failed catalog fetch means the server did not answer.
   */
  const connection: ConnectionState = !system
    ? "unreachable"
    : !system.server_url
      ? "unconfigured"
      : catalogError
        ? "unreachable"
        : "connected"

  const toggleTheme = () => {
    setTheme((current) => (current === "night" ? "light" : "night"))
  }

  /**
   * A saved or discovered address changes what the whole shell should show:
   * the navbar badge, the footer URL and the catalog all derive from it. The
   * settings are applied immediately so the form reflects the new value, then
   * `system` and the catalog are refreshed against the new server.
   */
  const handleSettingsChanged = (next: Settings) => {
    setSettings(next)
    void getSystemInfo()
      .then(setSystem)
      .catch(() => {
        // The shell already renders from the previous system snapshot; a
        // failed refresh here is not worth interrupting the user for.
      })

    if (!next.server_url) {
      // Nothing to fetch: mirror the mount-time short circuit so the Store
      // says "No server set" instead of "Server unreachable".
      setCatalog([])
      setCatalogError(
        "No server address is configured. Set one in Settings or discover a server on the LAN.",
      )
      return
    }

    void getCatalog()
      .then((entries) => {
        setCatalog(entries)
        setCatalogError(null)
      })
      .catch((error: unknown) => {
        setCatalog([])
        setCatalogError(messageFor(error, "Could not reach the server."))
      })
  }

  /**
   * Start an install (or a forced re-download) and adopt the returned job.
   *
   * The job is registered locally as well as in the backend, because the poll
   * loop only runs while `jobs` holds an active job: without this the progress
   * bar would never start and the completion refresh would never fire.
   */
  const startInstall = async (entryId: number, force = false): Promise<Job> => {
    const job = await installApp(entryId, force)
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])

    if (isActiveJob(job)) {
      activeJobIds.current.add(job.id)
    } else {
      // The worker finished before the response was serialized (a tiny app, or
      // an entry that was already current). No poll will ever observe the
      // transition, so refresh here instead of leaving the UI stale.
      void refreshAfterInstall()
    }
    return job
  }

  /** Launch an installed application; the backend detaches the process. */
  const startLaunch = (entryId: number) => launchApp(entryId)

  /** Remove an install and its files, then refresh the Library and the Store. */
  const removeInstall = async (entryId: number): Promise<void> => {
    await removeApp(entryId)
    await refreshAfterInstall()
  }

  const navigate = (next: ViewId) => {
    if (next !== "app") setSelectedApp(null)
    setView(next)
  }

  const openApp = (app: CatalogApp) => {
    setSelectedApp(app)
    setView("app")
  }

  /**
   * Open an installed app from the Library. The catalog entry may be gone if
   * the administrator deleted it server-side, so fall back to the install row.
   */
  const openInstall = (install: Install) => {
    const entry = catalog.find((app) => app.id === install.entry_id)
    openApp(
      entry ?? {
        id: install.entry_id,
        title: install.title,
        description:
          "This application is installed on this computer but is no longer listed on the server.",
        thumbnail: "",
        installed: true,
        installed_version: install.version,
        update_available: false,
      },
    )
  }

  const meta = pageMeta[view]

  // `selectedApp` is a snapshot taken when the row was clicked, so it goes
  // stale as soon as an install finishes. Prefer the freshly fetched catalog
  // row and fall back to the snapshot when the entry is no longer listed.
  const detailApp = selectedApp
    ? (catalog.find((app) => app.id === selectedApp.id) ?? selectedApp)
    : null

  if (systemError) {
    return (
      <div className="grid h-full place-items-center bg-base-100 p-6 text-base-content">
        <ErrorNotice
          className="w-full max-w-md"
          title="The client backend is unreachable"
          message={systemError}
          onRetry={retry}
        />
      </div>
    )
  }

  if (!system) {
    return (
      <div className="grid h-full place-items-center bg-base-100 text-base-content">
        <span className="loading loading-spinner loading-lg" aria-label="Loading" />
      </div>
    )
  }

  return (
    <AppShell
      activeView={view}
      connection={connection}
      serverUrl={system.server_url}
      version={system.version}
      theme={theme}
      onNavigate={navigate}
      onToggleTheme={toggleTheme}
    >
      {view !== "app" && (
        <header className="mb-5">
          <h1 className="text-xl font-semibold leading-tight">{meta.title}</h1>
          <p className="text-xs text-base-content/60">{meta.subtitle}</p>
        </header>
      )}

      {view === "catalog" &&
        (catalogError ? (
          <ErrorNotice
            title="The catalog could not be loaded"
            message={catalogError}
            onRetry={retry}
          />
        ) : loading ? (
          <div className="grid place-items-center py-24">
            <span className="loading loading-spinner loading-lg" aria-label="Loading catalog" />
          </div>
        ) : (
          <CatalogView apps={catalog} onOpenApp={openApp} />
        ))}

      {view === "app" && detailApp && (
        <AppDetailView
          app={detailApp}
          install={installs.find((item) => item.entry_id === detailApp.id)}
          job={jobs.find(
            (item) => item.entry_id === detailApp.id && isActiveJob(item),
          )}
          onBack={() => navigate("catalog")}
          onInstall={(force) => startInstall(detailApp.id, force)}
          onLaunch={() => startLaunch(detailApp.id)}
        />
      )}

      {view === "library" && (
        <LibraryView
          installs={installs}
          catalog={catalog}
          onOpenApp={openApp}
          onOpenInstall={openInstall}
          onBrowse={() => navigate("catalog")}
          onLaunch={startLaunch}
          onRemove={removeInstall}
        />
      )}

      {view === "downloads" && <DownloadsView jobs={jobs} />}

      {view === "settings" && (
        <SettingsView
          system={system}
          settings={settings ?? { server_url: system.server_url, discovered_at: "" }}
          connection={connection}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSettingsSaved={handleSettingsChanged}
        />
      )}
    </AppShell>
  )
}

export default App
