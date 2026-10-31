import { useEffect, useMemo, useRef, useState } from "react"
import { ApiError, browse } from "../api/client"
import type { BrowseResult } from "../types"
import { joinPath, pathSegments } from "../lib/paths"
import { ChevronRightIcon, FileIcon, FolderIcon } from "./icons"

/** Extensions offered by default when the picker selects an executable. */
const DEFAULT_FILE_EXTENSIONS = [".exe", ".bat", ".cmd", ".com", ".sh"]

interface PathPickerProps {
  open: boolean
  /** `"folder"` picks a directory, `"file"` picks a file inside one. */
  mode?: "folder" | "file"
  /**
   * Directory the picker is confined to (relative to `data/apps`).
   * Empty means the whole managed apps folder.
   */
  rootPath?: string
  /** Directory to open at (relative to `data/apps`). Falls back to `rootPath`. */
  initialPath?: string
  /** File highlighted on open when `mode` is `"file"`. */
  initialSelection?: string
  title?: string
  /** Extensions offered in file mode while "Show all files" is off. */
  fileExtensions?: string[]
  /** Receives a path relative to `data/apps`. */
  onSelect: (path: string) => void
  onCancel: () => void
}

function isInside(root: string, path: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`)
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot).toLowerCase() : ""
}

/**
 * Modal browser backed by `GET /api/files/browse`.
 *
 * In folder mode only directories are listed, because the picker's job is
 * choosing an application directory. In file mode directories still navigate,
 * while files can be selected — by default only launchable ones, with a
 * "Show all files" escape hatch for unusual builds.
 */
export function PathPicker({
  open,
  mode = "folder",
  rootPath = "",
  initialPath = "",
  initialSelection = "",
  title,
  fileExtensions = DEFAULT_FILE_EXTENSIONS,
  onSelect,
  onCancel,
}: PathPickerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const startPath = isInside(rootPath, initialPath) ? initialPath : rootPath

  const [path, setPath] = useState(startPath)
  const [selection, setSelection] = useState<{
    dir: string
    name: string
  } | null>(
    initialSelection ? { dir: startPath, name: initialSelection } : null,
  )
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [current, setCurrent] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const root = rootPath

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
        // A stored path can point at a folder that no longer exists; fall back
        // to the confinement root instead of dead-ending on an error.
        if (path !== rootPath) {
          setPath(rootPath)
          return
        }
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
  }, [open, path, rootPath])

  const rootLabel = root
    ? (root.split("/").filter(Boolean).pop() ?? root)
    : "data/apps"
  const segments = pathSegments(path).slice(pathSegments(root).length)
  const directories = current?.directories ?? []

  const files = useMemo(() => {
    const visible = (current?.files ?? []).filter(
      (name) => showAllFiles || fileExtensions.includes(extensionOf(name)),
    )
    return visible.sort((a, b) => {
      const aKnown = fileExtensions.includes(extensionOf(a))
      const bKnown = fileExtensions.includes(extensionOf(b))
      if (aKnown !== bKnown) return aKnown ? -1 : 1
      return a.localeCompare(b, undefined, { sensitivity: "base" })
    })
  }, [current, showAllFiles, fileExtensions])

  // The selection survives browsing away and back, so the confirm button does
  // not flap while the user explores subfolders.
  const selectedValue = selection
    ? joinPath(selection.dir, selection.name)
    : ""
  const confirmDisabled =
    loading || Boolean(error) || (mode === "file" && !selectedValue)

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
        <h3 className="text-lg font-bold">
          {title ??
            (mode === "file"
              ? "Choose executable"
              : "Choose application directory")}
        </h3>
        <p className="mt-1 text-xs text-base-content/60">
          {mode === "file" ? (
            <>
              Files inside{" "}
              <span className="font-mono">{root || "data/apps"}</span>.
            </>
          ) : (
            <>
              Folders are relative to{" "}
              <span className="font-mono">data/apps</span>.
            </>
          )}
        </p>

        <div className="breadcrumbs mt-3 py-0 text-xs">
          <ul>
            <li>
              <button
                type="button"
                className="link link-hover"
                onClick={() => setPath(root)}
              >
                {rootLabel}
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

        {mode === "file" && (
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={showAllFiles}
              onChange={(event) => setShowAllFiles(event.target.checked)}
            />
            <span>Show all files</span>
          </label>
        )}

        {error && (
          <div role="alert" className="alert alert-error mt-3">
            <span className="text-sm">{error}</span>
            {root !== "" && (
              <span className="text-xs">
                Check the application directory on the form.
              </span>
            )}
          </div>
        )}

        <div className="mt-3 h-64 overflow-y-auto rounded-box border border-base-300 bg-base-200">
          {loading ? (
            <div className="grid h-full place-items-center">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : (
            <ul className="menu w-full">
              {path !== root && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const parts = path.split("/").filter(Boolean)
                      const parent = parts.slice(0, -1).join("/")
                      setPath(isInside(root, parent) ? parent : root)
                    }}
                  >
                    <FolderIcon width={16} height={16} className="opacity-50" />
                    <span className="text-base-content/60">..</span>
                  </button>
                </li>
              )}
              {directories.map((directory) => (
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
              {mode === "file" &&
                files.map((file) => {
                  const isSelected =
                    selection?.dir === path && selection.name === file
                  const launchable = fileExtensions.includes(extensionOf(file))
                  return (
                    <li key={file}>
                      <button
                        type="button"
                        className={isSelected ? "menu-active" : undefined}
                        onClick={() => setSelection({ dir: path, name: file })}
                        onDoubleClick={() => onSelect(joinPath(path, file))}
                      >
                        <FileIcon
                          width={16}
                          height={16}
                          className={
                            launchable ? "text-primary" : "opacity-50"
                          }
                        />
                        <span className="flex-1 truncate font-mono text-xs">
                          {file}
                        </span>
                      </button>
                    </li>
                  )
                })}
              {!error &&
                directories.length === 0 &&
                (mode === "folder" || files.length === 0) && (
                  <li className="menu-disabled">
                    <span className="text-xs text-base-content/50">
                      {mode === "folder"
                        ? "No subfolders here."
                        : showAllFiles
                          ? "This folder is empty."
                          : "No executables here — turn on “Show all files”."}
                    </span>
                  </li>
                )}
            </ul>
          )}
        </div>

        <div className="mt-3 truncate rounded-box bg-base-200 px-3 py-2 font-mono text-xs">
          {mode === "file"
            ? selectedValue || "No file selected"
            : path || "data/apps"}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onSelect(mode === "file" ? selectedValue : path)}
            disabled={confirmDisabled}
          >
            {mode === "file" ? "Use this file" : "Use this folder"}
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
