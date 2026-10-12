/**
 * UtcClock — Global UTC time + daily-reset countdown.
 *
 * Traders were getting confused by local-time vs UTC: the platform resets the
 * daily-loss limit and rolls the trading-day count at 00:00 UTC (see
 * worker/index.js resetDailyLoss + worker/executors.js). This surfaces the
 * authoritative clock so "when does my daily drawdown reset?" is always answerable.
 *
 * Renders a compact pill: current UTC time and the time remaining until the
 * next UTC midnight. Updates every second. `compact` drops the live clock and
 * shows just the countdown (used where header space is tight). `showReset`
 * (default true) toggles the "resets in …" countdown — set false to show just
 * the live clock where the reset is already surfaced elsewhere (e.g. the gauge).
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function getParts() {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");

  // Milliseconds until the next 00:00 UTC — the daily-loss reset boundary.
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
  );
  const totalSec = Math.max(0, Math.floor((nextMidnight - now.getTime()) / 1000));
  const ch = Math.floor(totalSec / 3600);
  const cm = Math.floor((totalSec % 3600) / 60);

  return { hh, mm, ch, cm };
}

export default function UtcClock({ compact = false, showReset = true, className = "" }) {
  const [t, setT] = useState(getParts);

  useEffect(() => {
    const id = setInterval(() => setT(getParts()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = `${t.ch}h ${String(t.cm).padStart(2, "0")}m`;
  const title = showReset
    ? `Current time is ${t.hh}:${t.mm} UTC. The daily-loss limit resets and a new trading day begins at 00:00 UTC — in ${countdown}.`
    : `Current time is ${t.hh}:${t.mm} UTC. The daily-loss limit resets and a new trading day begins at 00:00 UTC.`;

  return (
    <div
      title={title}
      className={`flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs text-muted-foreground ${className}`}
    >
      <Clock className="w-3.5 h-3.5 text-primary/80 shrink-0" />
      {!compact && (
        <span className="font-mono text-foreground/90">
          {t.hh}:{t.mm} <span className="text-muted-foreground">UTC</span>
        </span>
      )}
      {showReset && (
        <span className="text-muted-foreground/80">
          {!compact && <span className="mx-1 text-border">·</span>}
          resets in <span className="font-mono text-foreground/80">{countdown}</span>
        </span>
      )}
    </div>
  );
}
