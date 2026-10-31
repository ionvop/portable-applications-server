/** Shared shapes for the UI prototype. Mirrors the Flask API contract. */

export type ViewId =
  | "dashboard"
  | "catalog"
  | "entry"
  | "files"
  | "transfers"

export interface CatalogEntry {
  id: number
  title: string
  description: string
  thumbnail: string
  directory: string
  executable: string
  created_at: string | null
  updated_at: string | null
}

/** Payload accepted by the create/update catalog endpoints. */
export interface CatalogEntryInput {
  title: string
  description: string
  thumbnail: string
  directory: string
  executable: string
}

export interface SystemInfo {
  app_name: string
  version: string
  /** Interface the WSGI server binds to ("0.0.0.0" = all interfaces). */
  bind_host: string
  /** Loopback address the desktop UI loads. */
  ui_host: string
  port: number
  lan_ip: string
  /** URL a client computer opens to browse the catalog. */
  client_url: string
  data_dir: string
  apps_dir: string
  entry_count: number
  /** ISO-8601 UTC timestamp of when the server process started. */
  started_at: string
}

/** Catalog entry as exposed to client computers (no filesystem details). */
export interface ClientCatalogEntry {
  id: number
  title: string
  description: string
  thumbnail: string
}

export interface BrowseResult {
  path: string
  directories: string[]
  files: string[]
}

export type TransferStatus = "active" | "completed" | "failed"

/** A ZIP download served to a client computer. */
export interface Transfer {
  id: number
  /** Catalog entry id, or null when the entry has since been deleted. */
  entryId: number | null
  entryTitle: string
  /** IP address of the downloading client. */
  client: string
  /** Total uncompressed size of the application being streamed. */
  sizeBytes: number
  /** Uncompressed bytes streamed so far; equals `sizeBytes` when complete. */
  bytesProcessed: number
  status: TransferStatus
  /** ISO-8601 UTC timestamp. */
  startedAt: string
  /** ISO-8601 UTC timestamp, or null while the transfer is active. */
  finishedAt: string | null
}

/** One entry in the dashboard activity feed. */
export interface ActivityItem {
  id: string
  message: string
  detail: string
  /** ISO-8601 UTC timestamp of when the event happened. */
  occurredAt: string
  tone: "info" | "success" | "warning"
}
