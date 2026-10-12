import { useState, useEffect } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { TrendingUp, TrendingDown, LogOut } from "lucide-react";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { zoneExitQuote, zoneLabel } from "@/lib/zoneTrades";

/**
 * ZoneActivePositions — always-visible strip of the user's live bets with a live
 * countdown, current winning/losing state, and an early-EXIT button showing the
 * current cash-out P&L. The worker recomputes the exit value authoritatively
 * on click, so the booked amount can move slightly with price.
 */
export default function ZoneActivePositions({ bets, getPrice, config, onExit, excludeSymbol }) {
  const [, force] = useState(0);
  const [exiting, setExiting] = useState(null); // bet id being cashed out

  // Tick so countdowns + exit values update even without price changes.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  // When excludeSymbol is set, the displayed pair's bets are handled by the
  // chart HUD — this strip then only lists bets on OTHER pairs.
  const pending = bets.filter((b) => b.status === "pending" && (!excludeSymbol || b.symbol !== excludeSymbol));
  if (pending.length === 0) return null;
  const heading = excludeSymbol ? "Positions on other pairs" : "Open positions";

  const handleExit = async (bet) => {
    if (exiting) return;
    setExiting(bet.id);
    try {
      await onExit(bet.id);
    } finally {
      setExiting(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{heading}</p>
      {pending.map((b) => {
        const live = getPrice(toPriceFeedSymbol(b.symbol));
        const strike = +b.strike_price;
        const isUp = b.direction === "up";
        const secs = Math.max(0, Math.ceil((new Date(b.settle_at).getTime() - Date.now()) / 1000));
        const quote = live != null ? zoneExitQuote(b, live, config) : null;
        const pnl = quote?.pnl ?? 0;
        const winning = quote != null ? pnl > 0 : null; // net of fee

        return (
          <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {isUp ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" /> : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {b.symbol} · {isUp ? "UP" : "DOWN"} · ${Number(b.stake).toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  strike ${strike.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  {quote?.zone && (
                    <span className={`ml-1 ${
                      quote.zone === "far" ? (winning ? "text-green-400" : "text-red-400")
                      : quote.zone === "mid" ? (winning ? "text-green-300/80" : "text-red-300/80")
                      : "text-muted-foreground"
                    }`}>· {zoneLabel(quote.zone)} zone</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-sm text-foreground tabular-nums">{secs}s</span>
              <button
                type="button"
                onClick={() => handleExit(b)}
                disabled={exiting != null || quote == null}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  pnl >= 0
                    ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                    : "border-red-500/30 text-red-400 hover:bg-red-500/10"
                }`}
                title="Close this position now at its current value"
              >
                {exiting === b.id ? (
                  <BoltLoader className="w-3.5 h-3.5" />
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    Exit {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground">
        Exit pays the current zone's value. Touching the Far barrier knocks the trade out instantly at +85% / −100%.
      </p>
    </div>
  );
}
