import { useCallback, useEffect, useMemo, useState } from "react"
import { ApiError, browse, getStorage, revealPath } from "../api/client"
import type { BrowseResult, StorageInfo } from "../types"
import { joinPath, pathSegments } from "../lib/paths"
import { formatBytes } from "../lib/format"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  SearchIcon,
} from "../components/icons"

/** Turn any thrown value into a message suitable for an inline alert. */
function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return `${cause.status}: ${cause.message}`
  if (cause instanceof Error) return cause.message
  return fallback
}

export function FilesView() {
  const [path, setPath] = useState("")
  const [current, setCurrent] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)

  const [revealing, setRevealing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  // Storage is re-read on mount and whenever the folder is rescanned, so the
  // numbers always reflect the filesystem at the time of the last refresh.
  // The loading flag is set by `rescan` rather than here, so the effect only
  // synchronizes with the server instead of triggering a second render.
  useEffect(() => {
    const controller = new AbortController()
    getStorage()
      .then((result) => {
        if (controller.signal.aborted) return
        setStorage(result)
        setStorageError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setStorageError(errorMessage(cause, "Unable to read disk usage."))
      })
      .finally(() => {
        if (!controller.signal.aborted) setStorageLoading(false)
      })
    return () => controller.abort()
  }, [reloadKey])

  const rescan = useCallback(() => {
    setActionError(null)
    setStorageLoading(true)
    setStorageError(null)
    setReloadKey((value) => value + 1)
  }, [])

  const reveal = useCallback(async () => {
    if (revealing) return
    setRevealing(true)
    setActionError(null)
    try {
      await revealPath(path)
    } catch (cause: unknown) {
      setActionError(
        errorMessage(cause, "Unable to open the file explorer."),
      )
    } finally {
      setRevealing(false)
    }
  }, [path, revealing])

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
        <div className="card border border-base-300 surface lg:col-span-2">
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
          <div className="card border border-base-300 surface">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Folder actions</h2>
              <p className="text-xs text-base-content/60">
                {isRoot ? "data/apps" : path}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="btn btn-sm justify-start"
                  onClick={() => void reveal()}
                  disabled={revealing}
                >
                  {revealing && (
                    <span className="loading loading-spinner loading-xs" />
                  )}
                  Open in file explorer
                </button>
                <button
                  type="button"
                  className="btn btn-sm justify-start"
                  onClick={rescan}
                  disabled={loading}
                >
                  Rescan directory
                </button>
              </div>
              {actionError && (
                <div role="alert" className="alert alert-error alert-soft">
                  <span className="text-xs">{actionError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card border border-base-300 surface">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Storage</h2>

              {storageError ? (
                <div role="alert" className="alert alert-error alert-soft">
                  <span className="text-xs">{storageError}</span>
                  <button
                    type="button"
                    className="btn btn-xs"
                    onClick={rescan}
                  >
                    Retry
                  </button>
                </div>
              ) : storageLoading && !storage ? (
                <div className="grid place-items-center py-6">
                  <span className="loading loading-spinner loading-sm" />
                </div>
              ) : storage ? (
                <>
                  <dl className="flex flex-col gap-2 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-base-content/60">Applications</dt>
                      <dd className="font-mono">
                        {formatBytes(storage.apps.bytes)}
                        <span className="ml-1 text-base-content/50">
                          ({storage.apps.files})
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-base-content/60">Thumbnails</dt>
                      <dd className="font-mono">
                        {formatBytes(storage.thumbnails.bytes)}
                        <span className="ml-1 text-base-content/50">
                          ({storage.thumbnails.files})
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-base-content/60">Temporary</dt>
                      <dd className="font-mono">
                        {formatBytes(storage.tmp.bytes)}
                        <span className="ml-1 text-base-content/50">
                          ({storage.tmp.files})
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-base-300 pt-2">
                      <dt className="text-base-content/60">Managed total</dt>
                      <dd className="font-mono font-medium">
                        {formatBytes(storage.totalBytes)}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-base-content/60">Disk free</span>
                      <span className="font-mono">
                        {formatBytes(storage.disk.freeBytes)} of{" "}
                        {formatBytes(storage.disk.totalBytes)}
                      </span>
                    </div>
                    <progress
                      className="progress progress-info w-full"
                      value={storage.disk.usedBytes}
                      max={storage.disk.totalBytes}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
