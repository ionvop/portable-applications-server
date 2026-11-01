/** Every screen the client prototype can show. */
export type ViewId = "catalog" | "app" | "library" | "downloads" | "settings"

/** The two daisyUI themes declared in `index.css`. */
export type ThemeId = "night" | "light"

/** Catalog categories used for the storefront filter chips. */
export type AppCategory = "games" | "apps"

/**
 * A catalog row as delivered by the server, merged with local install state.
 * Mirrors `GET /api/catalog` in the Python backend.
 */
export interface CatalogApp {
  id: number
  title: string
  description: string
  thumbnail: string
  version: string
  size_bytes: number
  executable: string
  category: AppCategory
  installed: boolean
  installed_version: string
  update_available: boolean
  updated_at: string
}

/** Transfer states, ordered from pending to terminal. */
export type TransferStatus = "queued" | "downloading" | "extracting" | "done" | "failed"

/** One ZIP distribution job shown on the Downloads screen. */
export interface Transfer {
  id: number
  title: string
  directory: string
  status: TransferStatus
  /** 0–100, already rounded for display. */
  progress: number
  received_bytes: number
  total_bytes: number
  started_at: string
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
