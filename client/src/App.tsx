import { useEffect, useState } from "react"
import "./App.css"
import type { CatalogApp, ThemeId, ViewId } from "./types"
import { catalogApps, systemInfo, transfers } from "./data/mock"
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

  // daisyUI reads the theme from the document element, so mirror state there.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

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

  return (
    <AppShell
      activeView={view}
      serverUrl={systemInfo.server_url}
      version={systemInfo.version}
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

      {view === "catalog" && <CatalogView apps={catalogApps} onOpenApp={openApp} />}

      {view === "app" && selectedApp && (
        <AppDetailView app={selectedApp} onBack={() => navigate("catalog")} />
      )}

      {view === "library" && (
        <LibraryView
          apps={catalogApps}
          onOpenApp={openApp}
          onBrowse={() => navigate("catalog")}
        />
      )}

      {view === "downloads" && <DownloadsView transfers={transfers} />}

      {view === "settings" && (
        <SettingsView system={systemInfo} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </AppShell>
  )
}

export default App
