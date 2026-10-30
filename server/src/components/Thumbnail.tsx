import { useState } from "react"
import { thumbnailUrl } from "../api/client"
import type { CatalogEntry } from "../types"

const gradients = [
  "from-primary/70 to-secondary/70",
  "from-secondary/70 to-accent/70",
  "from-accent/70 to-info/70",
  "from-info/70 to-primary/70",
  "from-warning/70 to-error/70",
  "from-success/70 to-info/70",
]

function initials(title: string) {
  return title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

interface ThumbnailProps {
  entry: CatalogEntry
  className?: string
  /** Explicit image URL, e.g. a local object URL for an unsaved upload. */
  srcOverride?: string | null
}

export function Thumbnail({
  entry,
  className = "",
  srcOverride,
}: ThumbnailProps) {
  // Remember which URL failed so a newly picked image gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const gradient = gradients[entry.id % gradients.length]
  const src =
    srcOverride ?? (entry.thumbnail ? thumbnailUrl(entry.thumbnail) : "")

  if (src && failedSrc !== src) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <img
          src={src}
          alt={entry.title}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      </div>
    )
  }

  return (
    <div
      className={`grid place-items-center bg-linear-to-br ${gradient} ${className}`}
    >
      <span className="text-2xl font-bold tracking-wide text-base-100/90">
        {initials(entry.title)}
      </span>
    </div>
  )
}
