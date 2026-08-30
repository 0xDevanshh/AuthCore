/**
 * Faint dot-grid texture sitting behind the auth card. Purely decorative: fixed,
 * non-interactive, low opacity, and masked so it fades out toward the edges rather
 * than ending on a hard line. It should never compete with the card content.
 */
export function AuthBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-background"
    >
      <svg className="size-full" role="presentation">
        <defs>
          <pattern
            id="authcore-dot-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.5" className="fill-foreground" />
          </pattern>
          <radialGradient id="authcore-dot-fade">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="authcore-dot-mask">
            <rect width="100%" height="100%" fill="url(#authcore-dot-fade)" />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="url(#authcore-dot-grid)"
          mask="url(#authcore-dot-mask)"
          opacity="0.06"
        />
      </svg>
    </div>
  )
}
