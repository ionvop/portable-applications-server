import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

/** Shared attributes so every icon has identical stroke weight and sizing. */
function base(props: IconProps): IconProps {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    width: 20,
    height: 20,
    "aria-hidden": true,
    ...props,
  }
}

export function StoreIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 9.5V19a1 1 0 0 0 1 1H9v-5.5h6V20h4.5a1 1 0 0 0 1-1V9.5" />
      <path d="M2.5 9.5 4.2 4.7a1 1 0 0 1 .94-.7h13.72a1 1 0 0 1 .94.7l1.7 4.8" />
      <path d="M2.5 9.5a2.5 2.5 0 0 0 4.75 1.1 2.5 2.5 0 0 0 4.75 0 2.5 2.5 0 0 0 4.75 0 2.5 2.5 0 0 0 4.75-1.1" />
    </svg>
  )
}

export function LibraryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="18" rx="1.5" />
      <path d="M6.5 7.5h0M17.5 7.5h0" />
    </svg>
  )
}

export function DownloadsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v11" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" />
    </svg>
  )
}

export function GamepadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4A2.4 2.4 0 0 1 17 18.4l-1.8-1.6a2 2 0 0 0-1.3-.5h-3.8a2 2 0 0 0-1.3.5L7 18.4a2.4 2.4 0 0 1-3.2-1.6l-.7-3.4A4.5 4.5 0 0 1 7.5 8Z" />
      <path d="M8 11.5v2.5M6.75 12.75h2.5" />
      <path d="M15.5 12h0M17.5 13.75h0" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.2a.8.8 0 0 1 1.2-.7l8.4 6.1a.9.9 0 0 1 0 1.4l-8.4 6.1A.8.8 0 0 1 8 17.4Z" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v9" />
      <path d="m8.5 10 3.5 3.5L15.5 10" />
      <path d="M5 15.5V19h14v-3.5" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5" />
      <path d="m10.5 5.5-6.5 6.5 6.5 6.5" />
    </svg>
  )
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="7" rx="1.8" />
      <rect x="3" y="13" width="18" height="7" rx="1.8" />
      <path d="M7 7.5h0M7 16.5h0" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 5 5 10-10.5" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.5" />
    </svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </svg>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h0M4.5 12h0M4.5 17.5h0" />
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </svg>
  )
}

export function SizeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20 20 4" />
      <path d="M4 15v5h5" />
      <path d="M20 9V4h-5" />
    </svg>
  )
}

export function TimeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}
