/** Helpers for the relative paths used by `/api/files/browse`. */

/** Join a relative browse path with a child directory name. */
export function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name
}

/** Cumulative path segments for a breadcrumb, e.g. "A/B" → ["A", "A/B"]. */
export function pathSegments(path: string): { label: string; path: string }[] {
  if (!path) return []
  const parts = path.split("/").filter(Boolean)
  return parts.map((label, index) => ({
    label,
    path: parts.slice(0, index + 1).join("/"),
  }))
}
