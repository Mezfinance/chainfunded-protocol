import { useState, useEffect } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ZoneQuickFire — "press your luck" pre-fill strip shown while a trade is
 * live. Pre-fills stake, duration, and side from the focused bet so the
 * trader can fire the next one with a single tap on UP or DOWN.
 *
 * Same `onPlace(direction, stake, durationSec)` contract as ZoneTradePanel —
 * the page handler treats placements identically.
 */
export default function ZoneQuickFire({
  focusedBet,
  config,
  available,
  maxStake,
  drawdown,
  disabled,
  onPlace }) {
  const durations = config?.durations?.length
    ? config.durations
    : [Math.round((config?.durationMs ?? 60000) / 1000)];
  const defaultDur = focusedBet
    ? Math.round((new Date(focusedBet.settle_at).getTime() - new Date(focusedBet.lock_at).getTime()) / 1000)
    : (config?.defaultDurationSec ?? durations[0] ?? 60);
  const defaultStake = focusedBet ? Number(focusedBet.stake) : 0;

  const [durSec, setDurSec] = useState(defaultDur);
  const [stake, setStake] = useState(defaultStake > 0 ? String(defaultStake) : "");
  const [submitting, setSubmitting] = useState(false);
  const [side, setSide] = useState(null);

  // When the focused bet changes (e.g. settles + a new one becomes focused),
  // re-prefill so the strip always reflects the current "fire same" intent.
  useEffect(() => {
    if (!focusedBet) return;
    setDurSec(Math.round((new Date(focusedBet.settle_at).getTime() - new Date(focusedBet.lock_at).getTime()) / 1000));
    setStake(String(Number(focusedBet.stake)));
  }, [focusedBet?.id]);

  const minStake = config?.minStake ?? 1;
  const cap = maxStake != null
    ? maxStake
    : Math.min(config?.maxStakeAbs ?? Infinity, available ?? Infinity);
  const amount = parseFloat(stake) || 0;
  const overCap = amount > cap + 1e-9;
  const validStake = amount >= minStake && amount <= cap;

  const breaches = (() => {
    const dd = drawdown;
    if (!dd || !(dd.startBal > 0) || amount <= 0) return false;
    const after = dd.currentBal - amount;
    const totalLossPct = Math.max(0, ((dd.startBal - after) / dd.startBal) * 100);
    const dailyLossPct = Math.max(0, ((dd.dayStart - after) / dd.startBal) * 100);
    return totalLossPct >= dd.totalPct || dailyLossPct >= dd.dailyPct;
  })();

  const place = async (direction) => {
    if (!validStake || submitting || disabled) return;
    setSide(direction);
    setSubmitting(true);
    try {
      await onPlace(direction, amount, durSec);
    } finally {
      setSubmitting(false);
      setSide(null);
    }
  };

  const focusedDir = focusedBet?.direction;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Up next</span>
          <span className="text-[11px] text-muted-foreground">Pre-filled · fire same again</span>
        </div>
        {breaches && (
          <span className="text-[10px] text-red-300/90">⚠ would breach drawdown</span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {/* Stake */}
        <div className="sm:w-36 shrink-0">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-muted-foreground">Stake</span>
            <span className={overCap ? "text-red-400" : "text-muted-foreground"}>
              Max ${cap.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder={`Min $${minStake}`}
            className={`w-full rounded-md bg-secondary/40 border px-2 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 ${
              overCap ? "border-red-500/60 focus:ring-red-500" : "border-border focus:ring-primary"
            }`}
          />
        </div>

        {/* Duration chips */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground mb-1">Duration</div>
          <div className="grid grid-cols-7 gap-1">
            {durations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurSec(d)}
                className={`rounded-md border py-1.5 text-[11px] font-mono transition-colors ${
                  d === durSec
                    ? "border-primary text-foreground bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* UP / DOWN */}
        <div className="flex gap-2 sm:w-72">
          <Button
            onClick={() => place("up")}
            disabled={!validStake || disabled || submitting}
            className={`flex-1 min-h-[52px] font-grotesk font-bold ${
              focusedDir === "up"
                ? "bg-green-500/25 border border-green-500/50 text-green-200 hover:bg-green-500/35 ring-1 ring-green-500/40"
                : "bg-green-500/12 border border-green-500/25 text-green-400 hover:bg-green-500/20"
            }`}
          >
            {submitting && side === "up"
              ? <BoltLoader className="w-5 h-5" />
              : <><TrendingUp className="w-5 h-5 mr-1.5" /> Up</>}
          </Button>
          <Button
            onClick={() => place("down")}
            disabled={!validStake || disabled || submitting}
            className={`flex-1 min-h-[52px] font-grotesk font-bold ${
              focusedDir === "down"
                ? "bg-red-500/25 border border-red-500/50 text-red-200 hover:bg-red-500/35 ring-1 ring-red-500/40"
                : "bg-red-500/12 border border-red-500/25 text-red-400 hover:bg-red-500/20"
            }`}
          >
            {submitting && side === "down"
              ? <BoltLoader className="w-5 h-5" />
              : <><TrendingDown className="w-5 h-5 mr-1.5" /> Down</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
