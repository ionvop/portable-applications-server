import { useEffect, useMemo, useRef, useState } from "react"
import {
  ApiError,
  createEntry,
  deleteEntry,
  lanDownloadUrl,
  updateEntry,
  uploadThumbnail,
} from "../api/client"
import type { CatalogEntry, CatalogEntryInput, SystemInfo } from "../types"
import { Thumbnail } from "../components/Thumbnail"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { FolderPicker } from "../components/FolderPicker"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  ImageIcon,
  TrashIcon,
} from "../components/icons"

interface EntryDetailViewProps {
  /** `null` puts the form into create mode. */
  entry: CatalogEntry | null
  /** Server info, used to build a download link reachable from the LAN. */
  system: SystemInfo | null
  onBack: () => void
  onSaved: (entry: CatalogEntry) => void
  onDeleted: (id: number) => void
  /** Re-read the entry from the server (used by Cancel). */
  onRefresh: () => Promise<void> | void
}

const EMPTY_FORM: CatalogEntryInput = {
  title: "",
  description: "",
  thumbnail: "",
  directory: "",
  executable: "",
}

type FieldName = keyof CatalogEntryInput

/** Map the backend's user-readable messages onto the field they belong to. */
function fieldForMessage(message: string): FieldName | null {
  const text = message.toLowerCase()
  if (text.includes("title")) return "title"
  if (text.includes("directory") || text.includes("apps folder")) {
    return "directory"
  }
  if (text.includes("executable")) return "executable"
  return null
}

function toForm(entry: CatalogEntry | null): CatalogEntryInput {
  if (!entry) return { ...EMPTY_FORM }
  return {
    title: entry.title,
    description: entry.description,
    thumbnail: entry.thumbnail,
    directory: entry.directory,
    executable: entry.executable,
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message
  if (cause instanceof Error) return cause.message
  return "Something went wrong. Please try again."
}

export function EntryDetailView({
  entry,
  system,
  onBack,
  onSaved,
  onDeleted,
  onRefresh,
}: EntryDetailViewProps) {
  const isCreate = entry === null

  const [form, setForm] = useState<CatalogEntryInput>(() => toForm(entry))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({})

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [pickerOpen, setPickerOpen] = useState(false)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Object URL for the not-yet-uploaded thumbnail, revoked when it changes.
  const pendingPreview = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  )
  useEffect(() => {
    if (!pendingPreview) return
    return () => URL.revokeObjectURL(pendingPreview)
  }, [pendingPreview])

  const update = (field: FieldName, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  /** Entry-shaped object for the preview cards, including unsaved edits. */
  const previewEntry = useMemo<CatalogEntry>(
    () => ({
      id: entry?.id ?? 0,
      title: form.title || "Untitled entry",
      description: form.description,
      thumbnail: form.thumbnail,
      directory: form.directory,
      executable: form.executable,
      created_at: entry?.created_at ?? null,
      updated_at: entry?.updated_at ?? null,
    }),
    [entry, form],
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setFormError(null)
    setFieldErrors({})

    try {
      let thumbnail = form.thumbnail
      if (pendingFile) {
        const uploaded = await uploadThumbnail(pendingFile)
        thumbnail = uploaded.thumbnail
      }

      const payload: CatalogEntryInput = { ...form, thumbnail }
      const saved = entry
        ? await updateEntry(entry.id, payload)
        : await createEntry(payload)

      setPendingFile(null)
      onSaved(saved)
    } catch (cause: unknown) {
      const message = errorMessage(cause)
      setFormError(message)
      const field = fieldForMessage(message)
      if (field) setFieldErrors({ [field]: message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entry || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteEntry(entry.id)
      setConfirmOpen(false)
      onDeleted(entry.id)
    } catch (cause: unknown) {
      setDeleteError(errorMessage(cause))
    } finally {
      setDeleting(false)
    }
  }

  const handleCancel = async () => {
    setFormError(null)
    setFieldErrors({})
    setPendingFile(null)
    await onRefresh()
    onBack()
  }

  const fieldClass = (field: FieldName) =>
    `input w-full ${fieldErrors[field] ? "input-error" : ""}`

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
            <li className="text-base-content/60">
              {isCreate ? "New entry" : entry.title}
            </li>
          </ul>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isCreate && (
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-2"
              onClick={() => {
                setDeleteError(null)
                setConfirmOpen(true)
              }}
            >
              <TrashIcon width={16} height={16} />
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void handleCancel()}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="entry-form"
            className="btn btn-sm btn-primary gap-2"
            disabled={saving}
          >
            {saving && <span className="loading loading-spinner loading-xs" />}
            {isCreate ? "Create entry" : "Save changes"}
          </button>
        </div>
      </div>

      {formError && (
        <div role="alert" className="alert alert-error">
          <span className="text-sm">{formError}</span>
        </div>
      )}

      <form id="entry-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card border border-base-300 bg-base-200 lg:col-span-2">
            <div className="card-body gap-5">
              <h2 className="card-title text-base">Entry details</h2>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Title</legend>
                <input
                  type="text"
                  className={fieldClass("title")}
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="Grand Theft Auto: San Andreas"
                  autoFocus={isCreate}
                />
                {fieldErrors.title ? (
                  <p className="label text-error">{fieldErrors.title}</p>
                ) : (
                  <p className="label">Shown to clients in the catalog list.</p>
                )}
              </fieldset>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Description</legend>
                <textarea
                  className="textarea h-24 w-full"
                  value={form.description}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                  placeholder="Optional notes about the build or patch."
                />
                <p className="label">Optional notes about the build or patch.</p>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">
                    Application directory
                  </legend>
                  <div className="join w-full">
                    <input
                      type="text"
                      className={`input join-item w-full font-mono text-xs ${
                        fieldErrors.directory ? "input-error" : ""
                      }`}
                      value={form.directory}
                      onChange={(event) =>
                        update("directory", event.target.value)
                      }
                      placeholder="GTA San Andreas"
                    />
                    <button
                      type="button"
                      className="btn join-item gap-2"
                      onClick={() => setPickerOpen(true)}
                    >
                      <FolderIcon width={16} height={16} />
                      Browse
                    </button>
                  </div>
                  {fieldErrors.directory ? (
                    <p className="label text-error">{fieldErrors.directory}</p>
                  ) : (
                    <p className="label">Relative to data/apps.</p>
                  )}
                </fieldset>

                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Executable path</legend>
                  <input
                    type="text"
                    className={`input w-full font-mono text-xs ${
                      fieldErrors.executable ? "input-error" : ""
                    }`}
                    value={form.executable}
                    onChange={(event) =>
                      update("executable", event.target.value)
                    }
                    placeholder="gta_sa.exe"
                  />
                  {fieldErrors.executable ? (
                    <p className="label text-error">{fieldErrors.executable}</p>
                  ) : (
                    <p className="label">
                      Relative to the application directory.
                    </p>
                  )}
                </fieldset>
              </div>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Thumbnail</legend>
                <div className="flex items-center gap-4 rounded-box border border-dashed border-base-300 p-4">
                  <Thumbnail
                    entry={previewEntry}
                    srcOverride={pendingPreview}
                    className="size-16 shrink-0 rounded-field"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {pendingFile ? pendingFile.name : "Cover image"}
                    </p>
                    <p className="text-xs text-base-content/60">
                      PNG, JPG, WEBP, GIF or SVG. Uploaded when you save.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setPendingFile(file)
                      // Allow re-picking the same file after a cancel.
                      event.target.value = ""
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
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
                <Thumbnail
                  entry={previewEntry}
                  srcOverride={pendingPreview}
                  className="h-36 w-full"
                />
                <div className="bg-base-100 p-3">
                  <p className="text-sm font-semibold">{previewEntry.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-base-content/60">
                    {previewEntry.description || "No description yet."}
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
                  <dd className="font-mono">{entry?.id ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Created</dt>
                  <dd className="font-mono">{entry?.created_at ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-base-content/60">Updated</dt>
                  <dd className="font-mono">{entry?.updated_at ?? "—"}</dd>
                </div>
              </dl>
              <a
                className={`btn btn-sm justify-between gap-2 ${
                  entry ? "" : "btn-disabled"
                }`}
                href={entry ? lanDownloadUrl(system, entry.id) : undefined}
                aria-disabled={!entry}
                onClick={(event) => {
                  if (!entry) event.preventDefault()
                }}
              >
                Open distribution link
                <ChevronRightIcon width={16} height={16} />
              </a>
              {entry && system && (
                <p className="break-all font-mono text-[0.6875rem] text-base-content/40">
                  {lanDownloadUrl(system, entry.id)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete catalog entry"
        message={`Remove “${entry?.title ?? ""}” from the catalog? The application files on disk are not deleted.`}
        confirmLabel="Delete entry"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (deleting) return
          setConfirmOpen(false)
          setDeleteError(null)
        }}
      />

      <FolderPicker
        key={pickerOpen ? `picker-${form.directory}` : "picker-closed"}
        open={pickerOpen}
        initialPath={form.directory}
        onSelect={(path) => {
          update("directory", path)
          setPickerOpen(false)
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  )
}
