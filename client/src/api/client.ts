import type {
  CatalogApp,
  CatalogDetail,
  DiscoveryReply,
  Install,
  LaunchResult,
  Settings,
  SystemInfo,
} from "../types"

/**
 * An error raised by the client backend.
 *
 * The backend answers every failure with `{"error": "..."}`, so `message` is
 * the human-readable text the UI can show directly. `status` is the HTTP code
 * (or `0` when the request never reached the backend).
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** The base path every endpoint shares. Vite proxies it to the Python backend. */
const BASE = "/api"

/**
 * Perform a JSON request against the client backend.
 *
 * Non-2xx responses are converted into an {@link ApiError} carrying the
 * backend's `{"error": ...}` message. A body that is not JSON (a proxy error
 * page, a dropped connection) falls back to a generic HTTP message.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError("Could not reach the client backend.", 0)
  }

  const text = await response.text()
  const payload = parseJson(text)

  if (!response.ok) {
    const message =
      isErrorPayload(payload) && payload.error
        ? payload.error
        : `Request failed with HTTP ${response.status}.`
    throw new ApiError(message, response.status)
  }

  if (payload === undefined) {
    throw new ApiError("The backend returned a malformed response.", response.status)
  }

  return payload as T
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isErrorPayload(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  )
}

/** `GET /api/health` */
export function getHealth(): Promise<{ status: string }> {
  return request("/health")
}

/** `GET /api/system/info` */
export function getSystemInfo(): Promise<SystemInfo> {
  return request("/system/info")
}

/** `GET /api/catalog` */
export function getCatalog(): Promise<CatalogApp[]> {
  return request("/catalog")
}

/** `GET /api/catalog/<id>` */
export function getCatalogEntry(entryId: number): Promise<CatalogDetail> {
  return request(`/catalog/${entryId}`)
}

/** `GET /api/apps/installed` */
export function getInstalled(): Promise<Install[]> {
  return request("/apps/installed")
}

/**
 * `POST /api/apps/<id>/install`
 *
 * Runs synchronously on the backend: the promise resolves once the archive has
 * been downloaded and extracted. Pass `force` to re-download even when the
 * recorded version already matches.
 */
export function installApp(entryId: number, force = false): Promise<Install> {
  return request(`/apps/${entryId}/install`, {
    method: "POST",
    body: JSON.stringify({ force }),
  })
}

/** `POST /api/apps/<id>/launch` */
export function launchApp(entryId: number): Promise<LaunchResult> {
  return request(`/apps/${entryId}/launch`, { method: "POST" })
}

/** `DELETE /api/apps/<id>` */
export function removeApp(entryId: number): Promise<{ removed: number }> {
  return request(`/apps/${entryId}`, { method: "DELETE" })
}

/** `GET /api/settings` */
export function getSettings(): Promise<Settings> {
  return request("/settings")
}

/** `PUT /api/settings` */
export function updateSettings(serverUrl: string): Promise<Settings> {
  return request("/settings", {
    method: "PUT",
    body: JSON.stringify({ server_url: serverUrl }),
  })
}

/** `POST /api/settings/discover` */
export function discoverServer(): Promise<DiscoveryReply> {
  return request("/settings/discover", { method: "POST" })
}
