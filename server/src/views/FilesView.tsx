import { useEffect, useMemo, useState } from "react"
import { ApiError, browse } from "../api/client"
import type { BrowseResult } from "../types"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  SearchIcon,
} from "../components/icons"

/** Join a relative browse path with a child directory name. */
function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name
}

/** Cumulative path segments for the breadcrumb, e.g. "A/B" → ["A", "A/B"]. */
function pathSegments(path: string): { label: string; path: string }[] {
  if (!path) return []
  const parts = path.split("/").filter(Boolean)
  return parts.map((label, index) => ({
    label,
    path: parts.slice(0, index + 1).join("/"),
  }))
}

export function FilesView() {
  const [path, setPath] = useState("")
  const [current, setCurrent] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    browse(path)
      .then((result) => {
        if (controller.signal.aborted) return
        setCurrent(result)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setCurrent(null)
        setError(
          cause instanceof ApiError
            ? `${cause.status}: ${cause.message}`
            : cause instanceof Error
              ? cause.message
              : "Unable to read the folder.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [path, reloadKey])

  const isRoot = path === ""
  const segments = pathSegments(path)

  const needle = query.trim().toLowerCase()
  const directories = useMemo(
    () =>
      (current?.directories ?? []).filter((name) =>
        needle ? name.toLowerCase().includes(needle) : true,
      ),
    [current, needle],
  )
  const files = useMemo(
    () =>
      (current?.files ?? []).filter((name) =>
        needle ? name.toLowerCase().includes(needle) : true,
      ),
    [current, needle],
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="breadcrumbs py-0 text-sm">
          <ul>
            <li>
              <button
                type="button"
                className="link link-hover"
                onClick={() => setPath("")}
              >
                data/apps
              </button>
            </li>
            {segments.map((segment, index) => (
              <li key={segment.path}>
                {index === segments.length - 1 ? (
                  <span className="text-base-content/60">{segment.label}</span>
                ) : (
                  <button
                    type="button"
                    className="link link-hover"
                    onClick={() => setPath(segment.path)}
                  >
                    {segment.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <label className="input input-sm ml-auto w-full sm:w-64">
          <SearchIcon width={16} height={16} className="opacity-50" />
          <input
            type="search"
            placeholder="Filter files…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {error && (
        <div role="alert" className="alert alert-error">
          <span className="text-sm">Could not read this folder — {error}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card border border-base-300 bg-base-200 lg:col-span-2">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">
                {isRoot ? "Managed applications" : path}
              </h2>
              <span className="badge badge-ghost badge-sm">
                {directories.length} folders · {files.length} files
              </span>
            </div>

            {loading ? (
              <div className="grid place-items-center py-16">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-base-300">
                {directories.map((directory) => (
                  <li key={directory}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-base-300/40"
                      onClick={() => setPath(joinPath(path, directory))}
                    >
                      <FolderIcon
                        width={18}
                        height={18}
                        className="text-warning"
                      />
                      <span className="flex-1 truncate text-sm">
                        {directory}
                      </span>
                      <ChevronRightIcon
                        width={16}
                        height={16}
                        className="opacity-40"
                      />
                    </button>
                  </li>
                ))}
                {files.map((file) => (
                  <li
                    key={file}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <FileIcon
                      width={18}
                      height={18}
                      className="text-base-content/50"
                    />
                    <span className="flex-1 truncate font-mono text-xs">
                      {file}
                    </span>
                  </li>
                ))}
                {!error && directories.length === 0 && files.length === 0 && (
                  <li className="py-6 text-center text-sm text-base-content/60">
                    {needle
                      ? "No items match the filter."
                      : "This folder is empty."}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Folder actions</h2>
              <p className="text-xs text-base-content/60">
                Prototype only — these controls are not wired up.
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" className="btn btn-sm justify-start">
                  Open in file explorer
                </button>
                <button type="button" className="btn btn-sm justify-start">
                  Rescan directory
                </button>
                <button type="button" className="btn btn-sm justify-start">
                  Verify archive integrity
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
