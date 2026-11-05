/**
 * Thin typed wrapper around the Flask JSON API.
 *
 * The base path is relative so the same code works in every deployment mode:
 * - `npm run dev`  → Vite proxies `/api` to the Flask dev server.
 * - packaged app   → Flask serves the built bundle and the API from one origin.
 * - PyWebView      → loads `http://127.0.0.1:<port>/`, again same-origin.
 */

import type {
  ActivityItem,
  BrowseResult,
  CatalogEntry,
  CatalogEntryInput,
  ClientCatalogEntry,
  StorageInfo,
  SystemInfo,
  Transfer,
  TransferStatus,
} from "../types"

const API_BASE = "/api"

/** Error thrown for any non-2xx response, carrying the backend's message. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/**
 * Listeners notified whenever a request fails with an `ApiError`.
 *
 * `request()` emits on every failure, so no call site can swallow an error
 * silently. The `Toaster` component subscribes to render them; callers that
 * already show the error inline are unaffected because they still receive the
 * rejection.
 */
type ApiErrorListener = (error: ApiError) => void

const errorListeners = new Set<ApiErrorListener>()

/** Subscribe to failed requests. Returns an unsubscribe function. */
export function onApiError(listener: ApiErrorListener): () => void {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

function emitApiError(error: ApiError): void {
  for (const listener of errorListeners) {
    listener(error)
  }
}

/**
 * Report a non-HTTP failure through the same toast channel.
 *
 * Used for failures outside `request()`, such as a denied clipboard write, so
 * every user-visible failure takes the same path.
 */
export function reportError(message: string): void {
  emitApiError(new ApiError(message, 0))
}

/** Options accepted by `request` in addition to the fetch options. */
interface RequestOptions extends RequestInit {
  /**
   * Skip the global toast for this call. Used by the 2 s live polling so a
   * transient blip does not stack identical notifications.
   */
  silent?: boolean
}

/** Read the backend's `{"error": "..."}` body, falling back to the status text. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "error" in body) {
      const message = (body as { error: unknown }).error
      if (typeof message === "string" && message.trim()) {
        return message
      }
    }
  } catch {
    // Body was empty or not JSON; fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`
}

/** Perform a request and parse the JSON response, throwing `ApiError` on failure. */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { silent = false, ...init } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch (cause: unknown) {
    // A transport failure (server stopped, DNS, offline) never produces a
    // Response, so it would otherwise bypass the ApiError path entirely.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause
    }
    const error = new ApiError(
      `The server could not be reached${cause instanceof Error ? ` (${cause.message})` : ""}.`,
      0,
    )
    if (!silent) emitApiError(error)
    throw error
  }

  if (!response.ok) {
    const error = new ApiError(await readErrorMessage(response), response.status)
    if (!silent) emitApiError(error)
    throw error
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  // A 2xx with a body that is not JSON is still a failure the UI must show;
  // report it as an ApiError instead of leaking a raw SyntaxError.
  try {
    return (await response.json()) as T
  } catch {
    const error = new ApiError(
      "The server sent an unreadable response.",
      response.status,
    )
    if (!silent) emitApiError(error)
    throw error
  }
}

/** JSON request helper for the catalog write endpoints. */
function jsonRequest<T>(
  path: string,
  method: "POST" | "PUT",
  body: CatalogEntryInput,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function getSystemInfo(silent = false): Promise<SystemInfo> {
  return request<SystemInfo>("/system/info", { silent })
}

export function listEntries(silent = false): Promise<CatalogEntry[]> {
  return request<CatalogEntry[]>("/catalog", { silent })
}

export function getEntry(id: number): Promise<CatalogEntry> {
  return request<CatalogEntry>(`/catalog/${id}`)
}

export function createEntry(input: CatalogEntryInput): Promise<CatalogEntry> {
  return jsonRequest<CatalogEntry>("/catalog", "POST", input)
}

export function updateEntry(
  id: number,
  input: CatalogEntryInput,
): Promise<CatalogEntry> {
  return jsonRequest<CatalogEntry>(`/catalog/${id}`, "PUT", input)
}

export function deleteEntry(id: number): Promise<void> {
  return request<void>(`/catalog/${id}`, { method: "DELETE" })
}

export function browse(path = ""): Promise<BrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ""
  return request<BrowseResult>(`/files/browse${query}`)
}

/**
 * Open a folder from the managed apps area in the server's file explorer.
 *
 * Windows-only: the backend answers 501 on other platforms.
 */
export function revealPath(path = ""): Promise<{ revealed: string }> {
  return request<{ revealed: string }>("/files/reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
}

/** Wire shape returned by `GET /api/system/storage`. */
interface StorageResponse {
  apps: { bytes: number; files: number }
  thumbnails: { bytes: number; files: number }
  tmp: { bytes: number; files: number }
  total_bytes: number
  disk: { total_bytes: number; used_bytes: number; free_bytes: number }
}

/** Sizes of the managed folders and free space on the data volume. */
export async function getStorage(): Promise<StorageInfo> {
  const row = await request<StorageResponse>("/system/storage")
  return {
    apps: row.apps,
    thumbnails: row.thumbnails,
    tmp: row.tmp,
    totalBytes: row.total_bytes,
    disk: {
      totalBytes: row.disk.total_bytes,
      usedBytes: row.disk.used_bytes,
      freeBytes: row.disk.free_bytes,
    },
  }
}

export function uploadThumbnail(
  file: File,
): Promise<{ thumbnail: string }> {
  const form = new FormData()
  form.append("file", file)
  // No Content-Type header: the browser must set the multipart boundary.
  return request<{ thumbnail: string }>("/files/thumbnail", {
    method: "POST",
    body: form,
  })
}

/** URL of a stored thumbnail image, or an empty string when none is set. */
export function thumbnailUrl(filename: string): string {
  return filename ? `${API_BASE}/files/thumbnail/${encodeURIComponent(filename)}` : ""
}

/** Direct download URL for an entry's ZIP archive (handled by the browser). */
export function downloadUrl(id: number): string {
  return `${API_BASE}/distribution/${id}/download`
}

/**
 * Absolute download URL reachable from another machine on the LAN.
 *
 * Falls back to the relative URL when the LAN address is unknown, which keeps
 * the link working on the server machine itself.
 */
export function lanDownloadUrl(system: SystemInfo | null, id: number): string {
  if (!system || !system.lan_ip || system.lan_ip === "127.0.0.1") {
    return downloadUrl(id)
  }
  return `http://${system.lan_ip}:${system.port}${downloadUrl(id)}`
}

/** Client-safe catalog listing (only id, title, description, thumbnail). */
export function getClientCatalog(): Promise<ClientCatalogEntry[]> {
  return request<ClientCatalogEntry[]>("/client/catalog")
}

/** Wire shape returned by `GET /api/transfers`. */
interface TransferResponse {
  id: number
  entry_id: number | null
  entry_title: string
  client_ip: string
  size_bytes: number
  bytes_processed: number
  status: TransferStatus
  started_at: string
  finished_at: string | null
}

/** Wire shape returned by `GET /api/activity`. */
interface ActivityResponse {
  id: string
  message: string
  detail: string
  occurred_at: string
  tone: ActivityItem["tone"]
}

/** Recent transfers, newest first. */
export async function listTransfers(): Promise<Transfer[]> {
  // Polled every 2 s; a transient failure must not stack notifications.
  const rows = await request<TransferResponse[]>("/transfers", { silent: true })
  return rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    entryTitle: row.entry_title,
    client: row.client_ip || "unknown",
    sizeBytes: row.size_bytes,
    bytesProcessed: row.bytes_processed,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }))
}

/** Merged transfer and catalog event feed for the dashboard. */
export async function listActivity(): Promise<ActivityItem[]> {
  // Polled every 2 s; a transient failure must not stack notifications.
  const rows = await request<ActivityResponse[]>("/activity", { silent: true })
  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    detail: row.detail,
    occurredAt: row.occurred_at,
    tone: row.tone,
  }))
}

/** URL of the server-rendered catalog page for client browsers. */
export function clientPageUrl(system: SystemInfo | null): string {
  if (!system) return "/client"
  return system.client_url || `http://${system.lan_ip}:${system.port}/client`
}
