import { useCallback, useEffect, useRef, useState } from "react"
import "./App.css"
import type {
  AutoConnectResult,
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
  autoConnect,
  getCatalog,
  getInstalled,
  getJobs,
  getSettings,
  getSystemInfo,
  installApp,
  launchApp,
  removeApp,
  resetLocalStorage,
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
    title: "Catalog",
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

/**
 * Whether a failure means "the server could not be reached" rather than "the
 * server answered with an error".
 *
 * The backend maps a connection failure to `503` and collapses upstream `5xx`
 * to `502`, so only `503` justifies rediscovering the address. A `0` means the
 * local client backend itself is down, which rediscovery cannot fix.
 */
function isUnreachable(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 503
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
  /** The Catalog's search text, kept here so it survives view switches. */
  const [catalogQuery, setCatalogQuery] = useState("")

  const [loading, setLoading] = useState(true)
  /** The client backend itself is down — nothing can be rendered. */
  const [systemError, setSystemError] = useState<string | null>(null)
  /** The backend is up but the server catalog could not be fetched. */
  const [catalogError, setCatalogError] = useState<string | null>(null)
  /**
   * The latest failure from a background request (a job poll, a post-install
   * refresh, a local read). Rendered as a banner in the shell so a request can
   * never fail silently, whatever screen the user happens to be on.
   */
  const [actionError, setActionError] = useState<string | null>(null)

  // Guards against a stale response overwriting a newer one (StrictMode mounts
  // the effect twice, and Retry can fire while a load is still in flight).
  const requestId = useRef(0)

  // Job ids that were running at the last poll. A job that disappears from this
  // set has finished, which is the cue to refresh the Library and the Catalog.
  const activeJobIds = useRef<Set<number>>(new Set())

  // A single failed poll is transient (the next tick retries in one second), so
  // it stays quiet. Only a run of failures means the backend is really gone.
  const pollFailures = useRef(0)

  // Timestamp of the last focus-triggered refresh, used to throttle it.
  const lastFocusRefresh = useRef(0)

  // daisyUI reads the theme from the document element, so mirror state there.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  /**
   * Ask the backend to resolve a usable server address, rediscovering one when
   * the stored address is missing or dead.
   *
   * Returns `null` when the call itself failed. That degrades to "no address":
   * the catalog request that follows reports the real problem, and a failed
   * auto-connect must not blank the shell.
   */
  const resolveServer = useCallback(
    async (forceDiscovery: boolean): Promise<AutoConnectResult | null> => {
      try {
        return await autoConnect(forceDiscovery)
      } catch {
        return null
      }
    },
    [],
  )

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

    // No address stored yet: ask the backend to find one on the LAN before the
    // catalog request, so a first run connects without opening Settings.
    let serverUrl = info.server_url
    if (!serverUrl) {
      const resolved = await resolveServer(false)
      if (id !== requestId.current) return
      serverUrl = resolved?.server_url ?? ""
    }
    setSystem(serverUrl === info.server_url ? info : { ...info, server_url: serverUrl })

    // The catalog needs a server address; without one the request is pointless.
    const catalogRequest: Promise<CatalogApp[]> = serverUrl
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

    // A stored address that could not be reached is likely stale (the server
    // moved to a new lease). Rediscover once and retry the catalog, so the
    // client recovers without the user opening Settings. Only a connectivity
    // failure qualifies: a 5xx from a server that did answer is not an address
    // problem, and rediscovering would just swap a working server for another.
    let catalogOutcome = catalogResult
    let settingsOutcome = settingsResult
    if (catalogOutcome.status === "rejected" && serverUrl && isUnreachable(catalogOutcome.reason)) {
      const resolved = await resolveServer(true)
      if (id !== requestId.current) return
      // Retry whenever a server now answers, even at the same address: the
      // stored one may simply have been slow to come up.
      if (resolved?.connected) {
        if (resolved.server_url !== serverUrl) {
          serverUrl = resolved.server_url
          setSystem({ ...info, server_url: serverUrl })
        }
        const [retriedCatalog, refreshedSettings] = await Promise.allSettled([
          getCatalog(),
          getSettings(),
        ])
        if (id !== requestId.current) return
        catalogOutcome = retriedCatalog
        settingsOutcome = refreshedSettings
      }
    }

    if (catalogOutcome.status === "fulfilled") {
      setCatalog(catalogOutcome.value)
    } else {
      setCatalog([])
      setCatalogError(messageFor(catalogOutcome.reason, "Could not load the catalog."))
    }

    // Installs, settings and jobs are local, so a failure here is unexpected
    // but not fatal: degrade to empty rather than blanking the whole shell.
    // The failure is still reported, because an empty Library that is really a
    // failed read is exactly the kind of silent lie this step removes.
    setInstalls(installsResult.status === "fulfilled" ? installsResult.value : [])
    setSettings(settingsOutcome.status === "fulfilled" ? settingsOutcome.value : null)

    const localFailure = [installsResult, settingsOutcome, jobsResult].find(
      (result) => result.status === "rejected",
    )
    if (localFailure?.status === "rejected") {
      setActionError(messageFor(localFailure.reason, "Could not read the local client state."))
    }

    const initialJobs = jobsResult.status === "fulfilled" ? jobsResult.value : []
    activeJobIds.current = new Set(initialJobs.filter(isActiveJob).map((job) => job.id))
    setJobs(initialJobs)

    setLoading(false)
  }, [resolveServer])

  useEffect(() => {
    // `load` only writes state after its first `await`, so this cannot cascade
    // a synchronous render; the rule cannot see through the async boundary.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  /**
   * Re-read the local install list and the catalog after an install finishes,
   * so the Library gains the app and the Catalog flips to "Installed" without a
   * manual reload.
   */
  const refreshAfterInstall = useCallback(async () => {
    const [installsResult, catalogResult] = await Promise.allSettled([
      getInstalled(),
      getCatalog(),
    ])
    if (installsResult.status === "fulfilled") {
      setInstalls(installsResult.value)
    } else {
      setActionError(
        messageFor(installsResult.reason, "Could not refresh the installed applications."),
      )
    }
    if (catalogResult.status === "fulfilled") {
      setCatalog(catalogResult.value)
      setCatalogError(null)
    } else {
      setActionError(messageFor(catalogResult.reason, "Could not refresh the catalog."))
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
    } catch (cause) {
      // One failed poll is transient: the next tick retries in a second. A run
      // of them means the backend is gone, which the user needs to know.
      pollFailures.current += 1
      if (pollFailures.current >= 3) {
        setActionError(messageFor(cause, "Could not read the transfer progress."))
      }
      return
    }
    pollFailures.current = 0

    const current = new Set(next.filter(isActiveJob).map((job) => job.id))
    const finished = [...activeJobIds.current].filter((id) => !current.has(id))
    activeJobIds.current = current
    setJobs(next)

    if (finished.length > 0) void refreshAfterInstall()
  }, [refreshAfterInstall])

  /**
   * Re-read the local install list, the catalog and the job list when the
   * window regains focus.
   *
   * The client is a desktop app, so this fires when the user alt-tabs back from
   * a launched game — exactly the moment the Library may have changed
   * underneath them (an install finished while the window was in the
   * background, or the administrator edited the catalog server-side).
   */
  const refreshOnFocus = useCallback(async () => {
    // Without a server address the catalog request is pointless, so it is
    // skipped rather than allowed to fail and paint an error card.
    const catalogRequest: Promise<CatalogApp[] | null> = system?.server_url
      ? getCatalog()
      : Promise.resolve(null)

    const [installsResult, catalogResult, jobsResult] = await Promise.allSettled([
      getInstalled(),
      catalogRequest,
      getJobs(),
    ])

    if (installsResult.status === "fulfilled") {
      setInstalls(installsResult.value)
    } else {
      setActionError(
        messageFor(installsResult.reason, "Could not refresh the installed applications."),
      )
    }

    if (catalogResult.status === "fulfilled") {
      // `null` means the request was skipped, not that the catalog is empty.
      if (catalogResult.value) {
        setCatalog(catalogResult.value)
        setCatalogError(null)
      }
    } else {
      setCatalogError(messageFor(catalogResult.reason, "Could not refresh the catalog."))
    }

    if (jobsResult.status === "fulfilled") {
      const next = jobsResult.value
      activeJobIds.current = new Set(next.filter(isActiveJob).map((job) => job.id))
      setJobs(next)
    } else {
      setActionError(messageFor(jobsResult.reason, "Could not refresh the transfer history."))
    }
  }, [system?.server_url])

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
  const retry = useCallback(() => {
    setLoading(true)
    setSystemError(null)
    setCatalogError(null)
    setActionError(null)
    pollFailures.current = 0
    void load()
  }, [load])

  // Seed the throttle with the mount time so the window's initial focus (and
  // the `visible` visibility event some renderers fire on load) cannot
  // duplicate the `load()` that is already running.
  useEffect(() => {
    lastFocusRefresh.current = Date.now()
  }, [])

  /**
   * Refresh when the window regains focus.
   *
   * Four guards keep this from becoming a request storm: a hidden document is
   * ignored (the `visibilitychange` half of the pair), a running job is left to
   * the one-second poll that already owns that window, a full `load()` in
   * flight is not raced, and a refresh within `FOCUS_REFRESH_MS` of the
   * previous one is dropped, so clicking around the window cannot fire a
   * request per click.
   */
  useEffect(() => {
    const FOCUS_REFRESH_MS = 5000

    const maybeRefresh = () => {
      if (document.visibilityState === "hidden") return
      if (jobsRunning || loading) return

      const now = Date.now()
      if (now - lastFocusRefresh.current < FOCUS_REFRESH_MS) return
      lastFocusRefresh.current = now

      // A backend that died while the window was in the background recovers
      // through the full load, which also clears the full-screen error.
      if (systemError) {
        retry()
        return
      }

      void refreshOnFocus()
    }

    window.addEventListener("focus", maybeRefresh)
    document.addEventListener("visibilitychange", maybeRefresh)
    return () => {
      window.removeEventListener("focus", maybeRefresh)
      document.removeEventListener("visibilitychange", maybeRefresh)
    }
  }, [jobsRunning, loading, refreshOnFocus, retry, systemError])

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
      .catch((cause: unknown) => {
        // The shell keeps rendering from the previous snapshot, but the user
        // should still learn that the refresh failed.
        setActionError(messageFor(cause, "Could not refresh the client information."))
      })

    if (!next.server_url) {
      // Nothing to fetch: mirror the mount-time short circuit so the Catalog
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

  /** Remove an install and its files, then refresh the Library and the Catalog. */
  const removeInstall = async (entryId: number): Promise<void> => {
    await removeApp(entryId)
    await refreshAfterInstall()
  }

  /**
   * Delete every install, cached cover and transfer record, then re-read the
   * shell state so the Library empties and the Catalog flips back to "Install".
   *
   * The backend refuses with `409` while an install is running; that message is
   * rethrown so `SettingsView` can show it next to the button.
   */
  const resetStorage = async (): Promise<{ removed: number }> => {
    const result = await resetLocalStorage()
    await refreshAfterInstall()
    void getSystemInfo()
      .then(setSystem)
      .catch((cause: unknown) => {
        setActionError(messageFor(cause, "Could not refresh the client information."))
      })
    void getJobs()
      .then(setJobs)
      .catch((cause: unknown) => {
        setActionError(messageFor(cause, "Could not refresh the transfer history."))
      })
    return result
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
        version: install.version,
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
      theme={theme}
      error={actionError}
      onDismissError={() => setActionError(null)}
      onRetryError={retry}
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
          <CatalogView
            apps={catalog}
            query={catalogQuery}
            onQueryChange={setCatalogQuery}
            onOpenApp={openApp}
          />
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
          onResetStorage={resetStorage}
        />
      )}
    </AppShell>
  )
}

export default App
