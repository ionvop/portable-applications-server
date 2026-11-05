import { useMemo, useState } from "react"
import type { CatalogApp } from "../types"
import { Cover } from "../components/Cover"
import { DownloadIcon, GridIcon, ListIcon, PlayIcon, SearchIcon } from "../components/icons"

interface CatalogViewProps {
  apps: CatalogApp[]
  /**
   * The search text. Owned by `App` because the navbar search box edits the
   * same query, so the two inputs stay in sync.
   */
  query: string
  onQueryChange: (query: string) => void
  onOpenApp: (app: CatalogApp) => void
}

type Layout = "grid" | "table"
type Filter = "all" | "installed" | "updates"

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "updates", label: "Updates" },
]

/** Storefront: browse the catalog, filter it, and open an app. */
export function CatalogView({ apps, query, onQueryChange, onOpenApp }: CatalogViewProps) {
  const [layout, setLayout] = useState<Layout>("grid")
  const [filter, setFilter] = useState<Filter>("all")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = apps.filter((app) => {
      if (filter === "installed" && !app.installed) return false
      if (filter === "updates" && !app.update_available) return false
      if (!needle) return true
      return (
        app.title.toLowerCase().includes(needle) ||
        app.description.toLowerCase().includes(needle)
      )
    })

    return [...filtered].sort((a, b) => a.title.localeCompare(b.title))
  }, [apps, filter, query])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="input input-sm w-full sm:w-72">
          <SearchIcon width={16} height={16} className="opacity-50" />
          <input
            type="search"
            placeholder="Search by title or description…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <div className="join ml-auto">
          <button
            type="button"
            className={`btn btn-sm join-item ${layout === "grid" ? "btn-active" : ""}`}
            onClick={() => setLayout("grid")}
            aria-pressed={layout === "grid"}
          >
            <GridIcon width={16} height={16} />
            Grid
          </button>
          <button
            type="button"
            className={`btn btn-sm join-item ${layout === "table" ? "btn-active" : ""}`}
            onClick={() => setLayout("table")}
            aria-pressed={layout === "table"}
          >
            <ListIcon width={16} height={16} />
            List
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`btn btn-xs ${filter === option.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-base-content/60">
          {visible.length} of {apps.length} apps
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card border border-dashed border-base-300 bg-base-200">
          <div className="card-body items-center py-16 text-center">
            <p className="text-sm font-medium">Nothing matches those filters</p>
            <p className="text-xs text-base-content/60">
              Try another keyword, or switch back to All.
            </p>
          </div>
        </div>
      ) : layout === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((app) => (
            <article
              key={app.id}
              className="card overflow-hidden border border-base-300 bg-base-200 transition-colors hover:border-primary/60"
            >
              <button type="button" className="text-left" onClick={() => onOpenApp(app)}>
                <div className="relative">
                  <Cover app={app} className="h-32 w-full" />
                  {app.update_available && (
                    <span className="badge badge-warning badge-sm absolute top-2 right-2">
                      Update
                    </span>
                  )}
                </div>
                <div className="card-body gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="card-title text-sm">{app.title}</h3>
                    {app.installed_version && (
                      <span className="badge badge-sm font-mono whitespace-nowrap">
                        {app.update_available
                          ? `v${app.installed_version} → v${app.version}`
                          : `v${app.installed_version}`}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-base-content/60">{app.description}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-base-content/40">
                    <span className="font-mono">
                      {app.installed
                        ? app.update_available
                          ? `v${app.installed_version} → v${app.version}`
                          : `v${app.installed_version}`
                        : app.version
                          ? `v${app.version}`
                          : "Not downloaded"}
                    </span>
                    {app.installed ? (
                      <span className="badge badge-success badge-sm gap-1">
                        <PlayIcon width={12} height={12} />
                        Ready
                      </span>
                    ) : (
                      <span className="badge badge-ghost badge-sm gap-1">
                        <DownloadIcon width={12} height={12} />
                        Not installed
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Installed version</th>
                <th>Available</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((app) => (
                <tr key={app.id} className="hover:bg-base-300/40">
                  <td>
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left"
                      onClick={() => onOpenApp(app)}
                    >
                      <Cover app={app} className="size-8 shrink-0 rounded-field" />
                      <span className="font-medium">{app.title}</span>
                    </button>
                  </td>
                  <td>
                    <span className="badge badge-ghost badge-sm font-mono">
                      {app.installed_version || "—"}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-ghost badge-sm font-mono">
                      {app.version || "—"}
                    </span>
                  </td>
                  <td className="text-right">
                    {app.update_available ? (
                      <span className="badge badge-warning badge-sm">Update</span>
                    ) : app.installed ? (
                      <span className="badge badge-success badge-sm">Installed</span>
                    ) : (
                      <span className="badge badge-ghost badge-sm">Available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
