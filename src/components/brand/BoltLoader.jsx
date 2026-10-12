/**
 * BoltLoader — the ChainFunded lightning bolt as a loading indicator: a faint
 * outline that fills from the bottom up, looping (~2s by default). Inherits the
 * surrounding text colour via `currentColor`, so it stays legible on coloured
 * buttons (white) and dark panels (green/foreground) alike — a drop-in spinner
 * replacement. Size and colour come from `className` (e.g. "w-4 h-4 text-primary").
 *
 * Pure SVG/SMIL animation — no JS timers, so dozens can render cheaply.
 * Note: the /Funded payout receipt uses its own progress-driven green fill
 * (BoltFill) tied to the block countdown; this is the generic site loader.
 */
import { useId } from "react";

const PTS = "278 42 64 298 256 298 234 470 448 214 256 214 278 42";

export default function BoltLoader({ className = "w-4 h-4", seconds = 2, "aria-label": label = "Loading" }) {
  const clip = useId().replace(/:/g, ""); // colons are unsafe in url(#…) refs
  const dur = `${seconds}s`;
  return (
    <svg viewBox="0 0 512 512" className={className} role="status" aria-label={label}>
      <defs>
        <clipPath id={clip}><polygon points={PTS} /></clipPath>
      </defs>
      {/* faint base so the empty bolt reads as an outline */}
      <polygon points={PTS} fill="currentColor" opacity="0.2" />
      {/* fill rising from the bottom, clipped to the bolt, looping */}
      <rect x="0" width="512" fill="currentColor" clipPath={`url(#${clip})`}>
        <animate attributeName="y" dur={dur} repeatCount="indefinite" values="512;0;0" keyTimes="0;0.7;1" />
        <animate attributeName="height" dur={dur} repeatCount="indefinite" values="0;512;512" keyTimes="0;0.7;1" />
      </rect>
      {/* crisp outline on top */}
      <polygon points={PTS} fill="none" stroke="currentColor" strokeWidth="28" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
