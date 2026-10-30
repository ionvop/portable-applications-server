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
  host: string
  port: number
  lan_ip: string
  data_dir: string
  apps_dir: string
  entry_count: number
}

export interface BrowseResult {
  path: string
  directories: string[]
  files: string[]
}

export type TransferStatus = "active" | "completed" | "failed"

export interface Transfer {
  id: number
  entryTitle: string
  client: string
  sizeMb: number
  progress: number
  status: TransferStatus
  startedAt: string
}

export interface ActivityItem {
  id: number
  message: string
  detail: string
  time: string
  tone: "info" | "success" | "warning"
}
