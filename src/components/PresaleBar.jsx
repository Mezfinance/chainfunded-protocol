import { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { PRESALE, presaleActive } from "@/config/presale";

/**
 * Site-wide presale announcement bar.
 *
 * Shows above the main nav while the presale is live. Animated white-hot bolt,
 * pulsing live dot, value hook, and a CTA → in-app /presale. Dismissible (the
 * × hides it for ~5 days via localStorage). Suppressed on the trading terminal
 * and the presale page itself (handled in Layout). Honours prefers-reduced-motion.
 */

const BOLT = "278 72 96 278 240 278 220 440 416 232 272 232 278 72";
const DISMISS_KEY = "cfg_presale_bar_dismissed_at";
const RESHOW_MS = 5 * 24 * 60 * 60 * 1000; // re-show 5 days after dismissal

export default function PresaleBar() {
  // Lazy init from localStorage so dismissed users get no flash-of-bar.
  const [dismissed, setDismissed] = useState(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      return at > 0 && Date.now() - at < RESHOW_MS;
    } catch { return false; }
  });

  if (!presaleActive() || dismissed) return null;

  const dismiss = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="cfg-presale-bar relative w-full overflow-hidden border-b-2 border-primary">
      <div className="relative z-10 max-w-7xl mx-auto flex items-center gap-2 px-3 sm:px-6">
        <Link
          to={createPageUrl("Presale")}
          aria-label="ChainFunded $CFG presale — buy now"
          className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4 py-2 sm:h-16 sm:py-0 rounded-lg transition-colors hover:bg-white/[0.03] group"
        >
          {/* Left cluster — single row, truncates before crowding the CTA */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <svg className="cfg-bolt shrink-0" viewBox="0 0 512 512" aria-hidden="true">
              <polygon className="b-xl" points={BOLT} />
              <polygon className="b-l" points={BOLT} />
              <polygon className="b-flash" points={BOLT} />
              <polygon className="b-core" points={BOLT} />
              <circle className="b-spark" cx="150" cy="150" r="11" style={{ animationDelay: "0s" }} />
              <circle className="b-spark" cx="380" cy="120" r="8" style={{ animationDelay: ".3s" }} />
              <circle className="b-spark" cx="350" cy="400" r="9" style={{ animationDelay: ".7s" }} />
              <circle className="b-spark" cx="120" cy="360" r="7" style={{ animationDelay: "1.1s" }} />
              <circle className="b-spark" cx="430" cy="250" r="6" style={{ animationDelay: ".9s" }} />
              <circle className="b-spark" cx="90" cy="250" r="6" style={{ animationDelay: "1.4s" }} />
              <circle className="b-spark" cx="262" cy="60" r="7" style={{ animationDelay: ".5s" }} />
            </svg>

            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#2ee06f] animate-pulse" />
              <span className="hidden sm:inline font-mono text-xs font-bold tracking-[0.18em] text-[#7df3a6]">LIVE NOW</span>
            </span>

            <span className="font-grotesk font-bold text-[15px] sm:text-xl text-foreground tracking-tight truncate">
              $CFG Presale
            </span>

            <span className="hidden md:inline text-sm text-muted-foreground border-l border-border pl-4 whitespace-nowrap">
              Price rises every tier · below the ${PRESALE.listingPrice.toFixed(2)} listing
            </span>
          </div>

          {/* CTA — carries the $0.04 hook so the price survives on mobile (sub-copy is hidden there) */}
          <span className="cfg-presale-cta inline-flex items-center gap-1 rounded-lg sm:rounded-xl bg-primary px-3 sm:px-5 h-10 sm:h-11 shrink-0 font-grotesk font-bold text-[13px] sm:text-sm text-[#04140d] transition-transform group-hover:scale-[1.03]">
            <span className="hidden sm:inline">Buy $CFG from $0.04</span>
            <span className="sm:hidden">Buy · $0.04</span>
            <span aria-hidden="true">→</span>
          </span>
        </Link>

        {/* Dismiss — sibling of the Link so it never triggers navigation */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss presale banner"
          className="ml-1 sm:ml-2 shrink-0 grid place-items-center w-8 h-8 rounded-md text-[#9fc7b4] hover:text-white hover:bg-white/10 transition-colors"
        >
          <span className="text-xl leading-none">×</span>
        </button>
      </div>
    </div>
  );
}
