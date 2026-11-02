import { useEffect, useState } from "react"
import "./App.css"
import type { CatalogApp, SystemInfo, ThemeId, ViewId } from "./types"
import { ApiError, getCatalog, getSystemInfo } from "./api/client"
import { AppShell } from "./components/layout/AppShell"
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

function App() {
  const [view, setView] = useState<ViewId>("catalog")
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null)
  const [theme, setTheme] = useState<ThemeId>("night")
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [catalog, setCatalog] = useState<CatalogApp[]>([])
  const [error, setError] = useState<string | null>(null)

  // daisyUI reads the theme from the document element, so mirror state there.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  // Load the client snapshot and the server catalog once on mount.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [info, apps] = await Promise.all([getSystemInfo(), getCatalog()])
        if (cancelled) return
        console.log("catalog", apps)
        setSystem(info)
        setCatalog(apps)
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof ApiError ? cause.message : "Could not load the catalog.")
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleTheme = () => {
    setTheme((current) => (current === "night" ? "light" : "night"))
  }

  const navigate = (next: ViewId) => {
    if (next !== "app") setSelectedApp(null)
    setView(next)
  }

  const openApp = (app: CatalogApp) => {
    setSelectedApp(app)
    setView("app")
  }

  const meta = pageMeta[view]

  if (!system) {
    return (
      <div className="grid h-full place-items-center bg-base-100 text-base-content">
        {error ? (
          <div className="max-w-md text-center">
            <p className="text-sm font-medium">The client backend is unreachable</p>
            <p className="mt-1 text-xs text-base-content/60">{error}</p>
          </div>
        ) : (
          <span className="loading loading-spinner loading-lg" aria-label="Loading" />
        )}
      </div>
    )
  }

  return (
    <AppShell
      activeView={view}
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

      {view === "catalog" && <CatalogView apps={catalog} onOpenApp={openApp} />}

      {view === "app" && selectedApp && (
        <AppDetailView app={selectedApp} onBack={() => navigate("catalog")} />
      )}

      {view === "library" && (
        <LibraryView apps={catalog} onOpenApp={openApp} onBrowse={() => navigate("catalog")} />
      )}

      {view === "downloads" && <DownloadsView />}

      {view === "settings" && (
        <SettingsView system={system} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </AppShell>
  )
}

export default App
