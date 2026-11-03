import { useCallback, useEffect, useRef, useState } from "react"
import "./App.css"
import type {
  CatalogApp,
  ConnectionState,
  Install,
  Settings,
  SystemInfo,
  ThemeId,
  ViewId,
} from "./types"
import { ApiError, getCatalog, getInstalled, getSettings, getSystemInfo } from "./api/client"
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

  const [loading, setLoading] = useState(true)
  /** The client backend itself is down — nothing can be rendered. */
  const [systemError, setSystemError] = useState<string | null>(null)
  /** The backend is up but the server catalog could not be fetched. */
  const [catalogError, setCatalogError] = useState<string | null>(null)

  // Guards against a stale response overwriting a newer one (StrictMode mounts
  // the effect twice, and Retry can fire while a load is still in flight).
  const requestId = useRef(0)

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

    const [catalogResult, installsResult, settingsResult] = await Promise.allSettled([
      catalogRequest,
      getInstalled(),
      getSettings(),
    ])
    if (id !== requestId.current) return

    if (catalogResult.status === "fulfilled") {
      setCatalog(catalogResult.value)
    } else {
      setCatalog([])
      setCatalogError(messageFor(catalogResult.reason, "Could not load the catalog."))
    }

    // Installs and settings are local, so a failure here is unexpected but not
    // fatal: degrade to empty rather than blanking the whole shell.
    setInstalls(installsResult.status === "fulfilled" ? installsResult.value : [])
    setSettings(settingsResult.status === "fulfilled" ? settingsResult.value : null)

    setLoading(false)
  }, [])

  useEffect(() => {
    // `load` only writes state after its first `await`, so this cannot cascade
    // a synchronous render; the rule cannot see through the async boundary.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

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

      {view === "app" && selectedApp && (
        <AppDetailView app={selectedApp} onBack={() => navigate("catalog")} />
      )}

      {view === "library" && (
        <LibraryView
          installs={installs}
          catalog={catalog}
          onOpenApp={openApp}
          onOpenInstall={openInstall}
          onBrowse={() => navigate("catalog")}
        />
      )}

      {view === "downloads" && <DownloadsView />}

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
