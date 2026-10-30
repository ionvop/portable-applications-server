import type { CatalogEntry } from "../types"
import { Thumbnail } from "../components/Thumbnail"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  ImageIcon,
  TrashIcon,
} from "../components/icons"

interface EntryDetailViewProps {
  entry: CatalogEntry
  onBack: () => void
}

export function EntryDetailView({ entry, onBack }: EntryDetailViewProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={onBack}
        >
          <ArrowLeftIcon width={16} height={16} />
          Catalog
        </button>
        <div className="breadcrumbs py-0 text-xs">
          <ul>
            <li>Catalog</li>
            <li className="text-base-content/60">{entry.title}</li>
          </ul>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm gap-2">
            <TrashIcon width={16} height={16} />
            Delete
          </button>
          <button type="button" className="btn btn-sm">
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary">
            Save changes
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card border border-base-300 bg-base-200 lg:col-span-2">
          <div className="card-body gap-5">
            <h2 className="card-title text-base">Entry details</h2>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Title</legend>
              <input
                type="text"
                className="input w-full"
                defaultValue={entry.title}
              />
              <p className="label">Shown to clients in the catalog list.</p>
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Description</legend>
              <textarea
                className="textarea h-24 w-full"
                defaultValue={entry.description}
              />
              <p className="label">Optional notes about the build or patch.</p>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Application directory</legend>
                <div className="join w-full">
                  <input
                    type="text"
                    className="input join-item w-full font-mono text-xs"
                    defaultValue={entry.directory}
                  />
                  <button type="button" className="btn join-item gap-2">
                    <FolderIcon width={16} height={16} />
                    Browse
                  </button>
                </div>
                <p className="label">Relative to data/apps.</p>
              </fieldset>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Executable path</legend>
                <input
                  type="text"
                  className="input w-full font-mono text-xs"
                  defaultValue={entry.executable}
                />
                <p className="label">Relative to the application directory.</p>
              </fieldset>
            </div>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Thumbnail</legend>
              <div className="flex items-center gap-4 rounded-box border border-dashed border-base-300 p-4">
                <Thumbnail
                  entry={entry}
                  className="size-16 shrink-0 rounded-field"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Cover image</p>
                  <p className="text-xs text-base-content/60">
                    PNG, JPG, WEBP, GIF or SVG. Stored in data/thumbnails.
                  </p>
                </div>
                <button type="button" className="btn btn-sm gap-2">
                  <ImageIcon width={16} height={16} />
                  Replace
                </button>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Preview</h2>
              <div className="overflow-hidden rounded-box border border-base-300">
                <Thumbnail entry={entry} className="h-36 w-full" />
                <div className="bg-base-100 p-3">
                  <p className="text-sm font-semibold">{entry.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-base-content/60">
                    {entry.description}
                  </p>
                </div>
              </div>
              <p className="text-xs text-base-content/40">
                Approximate appearance in the client catalog.
              </p>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Metadata</h2>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Entry ID</dt>
                  <dd className="font-mono">{entry.id}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Created</dt>
                  <dd className="font-mono">{entry.created_at ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Updated</dt>
                  <dd className="font-mono">{entry.updated_at ?? "—"}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-sm justify-between gap-2"
              >
                Open distribution link
                <ChevronRightIcon width={16} height={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
