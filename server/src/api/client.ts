/**
 * Thin typed wrapper around the Flask JSON API.
 *
 * The base path is relative so the same code works in every deployment mode:
 * - `npm run dev`  → Vite proxies `/api` to the Flask dev server.
 * - packaged app   → Flask serves the built bundle and the API from one origin.
 * - PyWebView      → loads `http://127.0.0.1:<port>/`, again same-origin.
 */

import type {
  BrowseResult,
  CatalogEntry,
  CatalogEntryInput,
  SystemInfo,
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
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
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

export function getSystemInfo(): Promise<SystemInfo> {
  return request<SystemInfo>("/system/info")
}

export function listEntries(): Promise<CatalogEntry[]> {
  return request<CatalogEntry[]>("/catalog")
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
