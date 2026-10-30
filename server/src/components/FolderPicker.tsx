import { useEffect, useRef, useState } from "react"
import { ApiError, browse } from "../api/client"
import type { BrowseResult } from "../types"
import { joinPath, pathSegments } from "../lib/paths"
import { ChevronRightIcon, FolderIcon } from "./icons"

interface FolderPickerProps {
  open: boolean
  /** Directory to start browsing from (relative to data/apps). */
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}

/**
 * Minimal folder browser backed by `GET /api/files/browse`.
 *
 * Only directories are listed — the picker's job is choosing an application
 * directory, not inspecting files.
 */
export function FolderPicker({
  open,
  initialPath = "",
  onSelect,
  onCancel,
}: FolderPickerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [path, setPath] = useState(initialPath)
  const [current, setCurrent] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
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
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "Unable to read the folder.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, path])

  const segments = pathSegments(path)

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <div className="modal-box max-w-2xl">
        <h3 className="text-lg font-bold">Choose application directory</h3>
        <p className="mt-1 text-xs text-base-content/60">
          Folders are relative to <span className="font-mono">data/apps</span>.
        </p>

        <div className="breadcrumbs mt-3 py-0 text-xs">
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

        {error && (
          <div role="alert" className="alert alert-error mt-3">
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="mt-3 h-64 overflow-y-auto rounded-box border border-base-300 bg-base-200">
          {loading ? (
            <div className="grid h-full place-items-center">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : (
            <ul className="menu w-full">
              {path !== "" && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const parts = path.split("/").filter(Boolean)
                      setPath(parts.slice(0, -1).join("/"))
                    }}
                  >
                    <FolderIcon width={16} height={16} className="opacity-50" />
                    <span className="text-base-content/60">..</span>
                  </button>
                </li>
              )}
              {(current?.directories ?? []).map((directory) => (
                <li key={directory}>
                  <button
                    type="button"
                    onClick={() => setPath(joinPath(path, directory))}
                  >
                    <FolderIcon
                      width={16}
                      height={16}
                      className="text-warning"
                    />
                    <span className="flex-1 truncate">{directory}</span>
                    <ChevronRightIcon
                      width={14}
                      height={14}
                      className="opacity-40"
                    />
                  </button>
                </li>
              ))}
              {!error && (current?.directories ?? []).length === 0 && (
                <li className="menu-disabled">
                  <span className="text-xs text-base-content/50">
                    No subfolders here.
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="mt-3 rounded-box bg-base-200 px-3 py-2 font-mono text-xs">
          {path || "data/apps"}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onSelect(path)}
            disabled={loading || Boolean(error)}
          >
            Use this folder
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  )
}
