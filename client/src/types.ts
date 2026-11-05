/** Every screen the client can show. */
export type ViewId = "catalog" | "app" | "library" | "downloads" | "settings"

/** The two daisyUI themes declared in `index.css`. */
export type ThemeId = "night" | "light"

/**
 * How the client currently stands with the Portable Applications Server.
 *
 * Derived from local state rather than probed: `unconfigured` means no address
 * is stored, `unreachable` means the catalog request failed, and `connected`
 * means the last catalog fetch succeeded.
 */
export type ConnectionState = "connected" | "unreachable" | "unconfigured"

/**
 * A catalog row as delivered by `GET /api/catalog`.
 *
 * The listing exposes only public display fields plus this machine's install
 * state. Manifest fields (`executable`, `size_bytes`) are disclosed per entry
 * by `GET /api/catalog/<id>` — see {@link CatalogDetail}. `version` is the
 * server's published version, shown next to `installed_version` so an update
 * is legible without opening the detail view.
 */
export interface CatalogApp {
  id: number
  title: string
  description: string
  thumbnail: string
  version: string
  installed: boolean
  installed_version: string
  update_available: boolean
}

/**
 * One catalog entry with its manifest fields, as delivered by
 * `GET /api/catalog/<id>`.
 *
 * The backend does not compute `update_available` here; derive it by comparing
 * `installed_version` with `version`.
 */
export interface CatalogDetail {
  id: number
  title: string
  version: string
  executable: string
  size_bytes: number
  installed: boolean
  installed_version: string
}

/**
 * A locally installed application, as delivered by `GET /api/apps/installed`
 * and the install endpoint.
 *
 * `installed_at` is SQLite's `datetime('now')` format
 * (`"YYYY-MM-DD HH:MM:SS"`, UTC, no `T` or `Z`), or `null` when unknown.
 */
export interface Install {
  entry_id: number
  title: string
  directory: string
  executable: string
  version: string
  installed_at: string | null
}

/**
 * The lifecycle of an install job.
 *
 * `queued` and the two in-flight states are only ever reported by a live job;
 * a job read back from history is always `completed` or `failed`.
 */
export type JobStatus =
  | "queued"
  | "downloading"
  | "extracting"
  | "completed"
  | "failed"

/**
 * One install attempt, as delivered by `POST /api/apps/<id>/install`,
 * `GET /api/jobs` and `GET /api/jobs/<id>`.
 *
 * `total_bytes` is the archive size when the server sent a `Content-Length`,
 * otherwise the manifest's uncompressed size, so it is an estimate and the
 * ratio can exceed 100%. `error` is empty unless `status` is `failed`.
 */
export interface Job {
  id: number
  entry_id: number
  title: string
  status: JobStatus
  received_bytes: number
  total_bytes: number
  error: string
  started_at: string | null
  finished_at: string | null
}

/** Stored client settings, as delivered by `GET`/`PUT /api/settings`. */
export interface Settings {
  server_url: string
  discovered_at: string
}

/** The reply from `POST /api/settings/discover`. */
export interface DiscoveryReply {
  server_url: string
  app: string
  version: string
  host: string
}

/**
 * The reply from `POST /api/settings/test`.
 *
 * `server_url` echoes the address that was actually probed, which may be the
 * unsaved draft the user typed rather than the stored value.
 */
export interface ConnectionTest {
  status: string
  server_url: string
}

/** The reply from `POST /api/apps/<id>/launch`. */
export interface LaunchResult {
  entry_id: number
  pid: number
  executable: string
}

/** Local client facts shown in the navbar and Settings screen. */
export interface SystemInfo {
  app_name: string
  version: string
  ui_host: string
  port: number
  server_url: string
  data_dir: string
  apps_dir: string
  installed_count: number
}
