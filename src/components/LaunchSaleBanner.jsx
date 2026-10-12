import { useEffect, useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LAUNCH_SALE_TIERS } from "@/data/challengeTiers";

/**
 * Rotating notification banner under the main nav.
 *
 * Cycles through up to three slides:
 *   1. Active Launch Sale tiers — only when LAUNCH_SALE_TIERS is non-empty
 *   2. CFG Rewards Season 1 — recurring CTA pointing at the rewards page
 *   3. New-user onboarding — pointing first-timers to the getting-started flow
 *
 * Auto-advances every ROTATE_MS, pauses on hover, exposes pagination dots
 * for manual navigation, and slides incoming/outgoing content horizontally.
 */

const ROTATE_MS    = 7_500;
const SLIDE_MS     = 900;

export default function LaunchSaleBanner() {
  const slides = useSlides();
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);  // slide currently animating out
  const [direction, setDirection] = useState("forward"); // "forward" | "backward"
  const [paused, setPaused] = useState(false);
  const exitTimer = useRef(null);
  const len = slides.length;

  useEffect(() => {
    if (idx >= len) setIdx(0);
  }, [len, idx]);

  useEffect(() => {
    if (len <= 1 || paused) return;
    const id = setInterval(() => {
      transition((idx + 1) % len, "forward");
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [len, paused, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  function transition(nextIdx, dir) {
    if (nextIdx === idx) return;
    setDirection(dir);
    setPrevIdx(idx);
    setIdx(nextIdx);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => setPrevIdx(null), SLIDE_MS);
  }

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  if (len === 0) return null;
  const current = slides[Math.min(idx, len - 1)];
  const previous = prevIdx != null ? slides[prevIdx] : null;

  const enterDir = direction === "forward" ? "banner-slide-in-right" : "banner-slide-in-left";
  const exitDir  = direction === "forward" ? "banner-slide-out-left" : "banner-slide-out-right";

  return (
    <div
      className={`relative border-b ${current.containerClass} transition-colors overflow-hidden h-8`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {previous && (
        <Link
          to={previous.to}
          className={`absolute inset-0 flex items-center justify-center ${exitDir}`}
        >
          <div className="max-w-7xl w-full px-4 sm:px-6 flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            {previous.content}
          </div>
        </Link>
      )}
      <Link
        to={current.to}
        key={current.key}
        className={`absolute inset-0 flex items-center justify-center ${enterDir}`}
      >
        <div className="max-w-7xl w-full px-4 sm:px-6 flex items-center justify-center gap-2 text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {current.content}
        </div>
      </Link>
      {len > 1 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.preventDefault();
                transition(i, i > idx ? "forward" : "backward");
              }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? "bg-foreground/70" : "bg-foreground/20 hover:bg-foreground/40"
              }`}
              aria-label={`Show notification ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function useSlides() {
  return useMemo(() => {
    const out = [];

    if (LAUNCH_SALE_TIERS.length > 0) {
      out.push({
        key: "launch-sale",
        to: "/",
        containerClass: "bg-primary/15 border-primary/30 hover:bg-primary/20",
        content: (
          <>
            <span className="text-primary uppercase tracking-wider font-bold">Launch Sale</span>
            <span className="text-muted-foreground hidden sm:inline">
              {LAUNCH_SALE_TIERS.map((t, i) => (
                <span key={t.size}>
                  {i > 0 && " · "}
                  {t.label}{" "}
                  <span className="line-through opacity-60">${t.originalFee}</span>{" "}
                  <span className="text-foreground font-bold">${t.fee}</span>
                </span>
              ))}
            </span>
            <span className="text-foreground font-semibold underline-offset-2 hover:underline">
              <span className="hidden sm:inline">Claim your discount </span>→
            </span>
          </>
        ),
      });
    }

    out.push({
      key: "cfg-season-1",
      to: createPageUrl("CfgRewards"),
      containerClass: "bg-primary/15 border-primary/30 hover:bg-primary/20",
      content: (
        <>
          <span className="text-primary uppercase tracking-wider font-bold">CFG Rewards · Season 1</span>
          <span className="text-muted-foreground hidden sm:inline">
            Open now — register your accounts to start earning CFG governance tokens.
          </span>
          <span className="text-foreground font-semibold underline-offset-2 hover:underline">
            Register →
          </span>
        </>
      ),
    });

    out.push({
      key: "new-user",
      to: createPageUrl("Onboarding"),
      containerClass: "bg-primary/15 border-primary/30 hover:bg-primary/20",
      content: (
        <>
          <span className="text-primary uppercase tracking-wider font-bold">New to ChainFunded?</span>
          <span className="text-muted-foreground hidden sm:inline">
            Trade with simulated capital, get paid on real performance — no funds at risk.
          </span>
          <span className="text-foreground font-semibold underline-offset-2 hover:underline">
            <span className="hidden sm:inline">See how it works </span>→
          </span>
        </>
      ),
    });

    return out;
  }, []);
}
