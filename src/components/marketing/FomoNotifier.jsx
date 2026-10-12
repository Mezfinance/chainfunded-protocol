import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useFomoFeed } from "@/hooks/useFomoFeed";
import { formatFomoEvent } from "./fomoFormatters";

const DISPLAY_MS = 6_000;
const MIN_GAP_MS = 12_000;
const MAX_GAP_MS = 20_000;
const FIRST_DELAY_MS = 7_000;

function pickGap() {
  return MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
}

/**
 * Bottom-left toast that surfaces real recent protocol activity (challenge buys,
 * payouts, LP deposits, trades) to drive social proof on marketing pages.
 *
 * Mount once per page where you want the ticker. Pulls events via useFomoFeed,
 * cycles them at a randomized 12–20s cadence, pauses while the tab is hidden.
 */
// Fisher–Yates shuffle, returns a new array.
function shuffled(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function FomoNotifier() {
  const events = useFomoFeed();
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  const lastIdRef = useRef(null);
  const hideTimerRef = useRef(null);
  const nextTimerRef = useRef(null);

  useEffect(() => {
    if (!events || events.length === 0) return undefined;

    function clearTimers() {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    }

    // Refill the queue with a fresh shuffle. If the first pick would repeat the
    // last shown event, swap it with another slot to avoid back-to-back dupes.
    function refillQueue() {
      const next = shuffled(events);
      if (next.length > 1 && lastIdRef.current && next[0].id === lastIdRef.current) {
        const swapIdx = 1 + Math.floor(Math.random() * (next.length - 1));
        [next[0], next[swapIdx]] = [next[swapIdx], next[0]];
      }
      queueRef.current = next;
    }

    function showNext() {
      if (document.hidden) {
        nextTimerRef.current = setTimeout(showNext, 5_000);
        return;
      }
      if (queueRef.current.length === 0) refillQueue();
      const next = queueRef.current.shift();
      lastIdRef.current = next.id;
      setCurrent({ ...next, _shownAt: Date.now() });

      hideTimerRef.current = setTimeout(() => {
        setCurrent(null);
        nextTimerRef.current = setTimeout(showNext, pickGap());
      }, DISPLAY_MS);
    }

    nextTimerRef.current = setTimeout(showNext, FIRST_DELAY_MS);

    function onVisibility() {
      if (document.hidden) {
        clearTimers();
        setCurrent(null);
      } else if (!current) {
        nextTimerRef.current = setTimeout(showNext, 2_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimers();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // Re-arm when the events array reference changes (new poll batch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const formatted = current ? formatFomoEvent(current) : null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
      <AnimatePresence mode="wait">
        {formatted && (
          <motion.div
            key={current.id + "-" + current._shownAt}
            initial={{ opacity: 0, y: 16, x: -8 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 8, x: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border/70 bg-background/95 p-3 pr-2 shadow-lg backdrop-blur max-w-[320px] sm:max-w-sm"
          >
            <div className={`shrink-0 rounded-md bg-muted/60 p-2 ${formatted.accent}`}>
              <formatted.icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                {formatted.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatted.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrent(null)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
