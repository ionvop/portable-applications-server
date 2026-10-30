import { useState } from "react"
import type { BrowseResult } from "../types"
import { browseGta, browseRoot, fileSizes } from "../data/mockData"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  SearchIcon,
} from "../components/icons"

export function FilesView() {
  const [current, setCurrent] = useState<BrowseResult>(browseRoot)

  const isRoot = current.path === ""

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="breadcrumbs py-0 text-sm">
          <ul>
            <li>
              <button
                type="button"
                className="link link-hover"
                onClick={() => setCurrent(browseRoot)}
              >
                data/apps
              </button>
            </li>
            {!isRoot && (
              <li className="text-base-content/60">{current.path}</li>
            )}
          </ul>
        </div>
        <label className="input input-sm ml-auto w-full sm:w-64">
          <SearchIcon width={16} height={16} className="opacity-50" />
          <input type="search" placeholder="Filter files…" />
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card border border-base-300 bg-base-200 lg:col-span-2">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">
                {isRoot ? "Managed applications" : current.path}
              </h2>
              <span className="badge badge-ghost badge-sm">
                {current.directories.length} folders · {current.files.length} files
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-base-300">
              {current.directories.map((directory) => (
                <li key={directory}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-base-300/40"
                    onClick={() => setCurrent(browseGta)}
                  >
                    <FolderIcon
                      width={18}
                      height={18}
                      className="text-warning"
                    />
                    <span className="flex-1 truncate text-sm">{directory}</span>
                    <ChevronRightIcon
                      width={16}
                      height={16}
                      className="opacity-40"
                    />
                  </button>
                </li>
              ))}
              {current.files.map((file) => (
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
                  <span className="text-xs text-base-content/40">
                    {fileSizes[file] ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Storage</h2>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold">18.4 GB</span>
                <span className="text-xs text-base-content/60">of 240 GB</span>
              </div>
              <progress
                className="progress progress-primary h-2"
                value={18.4}
                max={240}
              />
              <dl className="mt-1 flex flex-col gap-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Games</dt>
                  <dd className="font-mono">16.9 GB</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Applications</dt>
                  <dd className="font-mono">1.5 GB</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Thumbnails</dt>
                  <dd className="font-mono">12 MB</dd>
                </div>
              </dl>
            </div>
          </div>

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
