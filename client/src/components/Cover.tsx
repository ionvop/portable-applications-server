import type { CatalogApp } from "../types"

const gradients = [
  "from-primary/70 to-secondary/70",
  "from-secondary/70 to-accent/70",
  "from-accent/70 to-info/70",
  "from-info/70 to-primary/70",
  "from-warning/70 to-error/70",
  "from-success/70 to-info/70",
]

/** Two-letter monogram used when no artwork is available. */
function initials(title: string): string {
  return title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

interface CoverProps {
  app: CatalogApp
  className?: string
  /** Larger type for the detail-page hero. */
  large?: boolean
}

/**
 * Artwork tile with a deterministic gradient fallback.
 * The prototype never fetches images, so the fallback is the primary path.
 */
export function Cover({ app, className = "", large = false }: CoverProps) {
  const gradient = gradients[app.id % gradients.length]

  return (
    <div
      className={`grid place-items-center bg-linear-to-br ${gradient} ${className}`}
      role="img"
      aria-label={`${app.title} cover art`}
    >
      <span
        className={`font-bold tracking-wide text-base-100/90 ${
          large ? "text-6xl" : "text-2xl"
        }`}
      >
        {initials(app.title)}
      </span>
    </div>
  )
}
