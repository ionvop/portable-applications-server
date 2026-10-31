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

/**
 * Split a relative file path into its directory and file name,
 * e.g. "bin/game.exe" → { dir: "bin", name: "game.exe" }.
 *
 * Backslashes are accepted too, so a hand-typed Windows path still seeds the
 * picker correctly.
 */
export function splitRelativePath(path: string): { dir: string; name: string } {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean)
  const name = parts.pop() ?? ""
  return { dir: parts.join("/"), name }
}
