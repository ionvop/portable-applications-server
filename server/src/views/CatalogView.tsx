import { useMemo, useState } from "react"
import type { CatalogEntry } from "../types"
import { Thumbnail } from "../components/Thumbnail"
import {
  GridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons"

interface CatalogViewProps {
  entries: CatalogEntry[]
  onOpenEntry: (entry: CatalogEntry) => void
}

type Layout = "grid" | "table"

export function CatalogView({ entries, onOpenEntry }: CatalogViewProps) {
  const [layout, setLayout] = useState<Layout>("grid")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("title")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? entries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(needle) ||
            entry.directory.toLowerCase().includes(needle),
        )
      : entries
    return [...filtered].sort((a, b) => {
      if (sort === "updated") {
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
      }
      return a.title.localeCompare(b.title)
    })
  }, [entries, query, sort])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="input input-sm w-full sm:w-72">
          <SearchIcon width={16} height={16} className="opacity-50" />
          <input
            type="search"
            placeholder="Search by title or folder…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <select
          className="select select-sm w-40"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort catalog"
        >
          <option value="title">Sort: Title</option>
          <option value="updated">Sort: Last updated</option>
        </select>

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
            Table
          </button>
        </div>

        <button type="button" className="btn btn-sm btn-primary gap-2">
          <PlusIcon width={16} height={16} />
          Add entry
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-base-content/60">
        <span>
          {visible.length} of {entries.length} entries
        </span>
        <span className="font-mono">data/apps</span>
      </div>

      {visible.length === 0 ? (
        <div className="card border border-dashed border-base-300 bg-base-200">
          <div className="card-body items-center py-16 text-center">
            <p className="text-sm font-medium">No entries match your search</p>
            <p className="text-xs text-base-content/60">
              Try a different title or folder name.
            </p>
          </div>
        </div>
      ) : layout === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="card border border-base-300 bg-base-200 text-left transition-colors hover:border-primary/60"
              onClick={() => onOpenEntry(entry)}
            >
              <Thumbnail entry={entry} className="h-32 w-full" />
              <div className="card-body gap-2 p-4">
                <h3 className="card-title text-sm">{entry.title}</h3>
                <p className="line-clamp-2 text-xs text-base-content/60">
                  {entry.description}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="badge badge-ghost badge-sm font-mono">
                    {entry.directory}
                  </span>
                  <span className="text-xs text-base-content/40">
                    {entry.updated_at?.slice(0, 10) ?? "—"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Directory</th>
                <th>Executable</th>
                <th>Updated</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id} className="hover:bg-base-300/40">
                  <td>
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left"
                      onClick={() => onOpenEntry(entry)}
                    >
                      <Thumbnail
                        entry={entry}
                        className="size-8 shrink-0 rounded-field"
                      />
                      <span className="font-medium">{entry.title}</span>
                    </button>
                  </td>
                  <td className="font-mono text-xs">{entry.directory}</td>
                  <td className="font-mono text-xs">{entry.executable}</td>
                  <td className="text-xs text-base-content/60">
                    {entry.updated_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`Remove ${entry.title}`}
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
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
