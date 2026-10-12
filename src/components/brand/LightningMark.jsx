/**
 * LightningMark — the ChainFunded lightning-bolt mark as an inline SVG.
 *
 * Single source for the brand glyph so it can be reused as a watermark,
 * loading spinner, or seal. Uses currentColor by default so it inherits
 * text color; pass `color` for a fixed brand green.
 *
 * Props:
 *   className — sizing / positioning
 *   color     — fill color (default currentColor)
 *   spin      — animate as a pulsing loader
 */
export default function LightningMark({ className = "w-5 h-5", color = "currentColor", spin = false }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`${className} ${spin ? "animate-pulse" : ""}`}
      fill={color}
      aria-hidden="true"
    >
      <polygon points="278 42 64 298 256 298 234 470 448 214 256 214 278 42" />
    </svg>
  );
}
