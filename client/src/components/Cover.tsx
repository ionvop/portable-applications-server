import { useState } from "react"

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

/**
 * The minimum a tile needs to render. Narrower than {@link CatalogApp} so an
 * install row (which has no catalog entry) can still show a cover.
 */
interface CoverSubject {
  id: number
  title: string
  /** Bare filename from the catalog; empty when the entry has no artwork. */
  thumbnail?: string
}

interface CoverProps {
  app: CoverSubject
  className?: string
  /** Larger type for the detail-page hero. */
  large?: boolean
}

/**
 * Artwork tile.
 *
 * The image is loaded through the client's own proxy (`/api/thumbnails/<name>`)
 * because the server sends no CORS headers. The gradient is always painted
 * underneath, so a missing, unreachable or broken cover degrades to the
 * monogram instead of a broken-image icon.
 */
export function Cover({ app, className = "", large = false }: CoverProps) {
  const gradient = gradients[app.id % gradients.length]
  const thumbnail = app.thumbnail ?? ""
  // Remember which source failed rather than a boolean, so a new thumbnail on
  // the same tile is retried instead of inheriting the previous failure.
  const [failedSource, setFailedSource] = useState<string | null>(null)

  const showImage = thumbnail !== "" && failedSource !== thumbnail

  return (
    <div
      className={`relative overflow-hidden bg-linear-to-br ${gradient} ${
        showImage ? "" : "grid place-items-center"
      } ${className}`}
      role="img"
      aria-label={`${app.title} cover art`}
    >
      {showImage ? (
        <img
          src={`/api/thumbnails/${encodeURIComponent(thumbnail)}`}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedSource(thumbnail)}
        />
      ) : (
        <span
          className={`font-bold tracking-wide text-base-100/90 ${
            large ? "text-6xl" : "text-2xl"
          }`}
        >
          {initials(app.title)}
        </span>
      )}
    </div>
  )
}
