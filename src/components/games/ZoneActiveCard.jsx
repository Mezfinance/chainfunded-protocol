import { TrendingUp, TrendingDown } from "lucide-react";
import BoltLoader from "@/components/brand/BoltLoader";
import { Button } from "@/components/ui/button";
import { zoneBuyout, zoneLabel } from "@/lib/zoneTrades";

/**
 * ZoneActiveCard — sidebar hero card for an active Zone Trading position.
 *
 * The single most important UI element when a trade is live: strike, live
 * price, current zone, time remaining, and a big EXIT button that shows the
 * live fair-value buyout (with a "if held to expiry" reference underneath, so
 * the trader sees what they're trading off vs. holding).
 *
 * Renders nothing when there's no active bet.
 */
export default function ZoneActiveCard({ bet, livePrice, config, onExit, exiting }) {
  if (!bet) return null;

  const isUp = bet.direction === "up";
  const Arrow = isUp ? TrendingUp : TrendingDown;
  const strike = +bet.strike_price;
  const stake = +bet.stake;

  const move = livePrice != null ? ((livePrice - strike) / strike) * 100 : 0;
  const moveFav = isUp ? move >= 0 : move <= 0;

  const quote = livePrice != null ? zoneBuyout(bet, livePrice, config) : null;
  const pnl = quote?.pnl ?? 0;
  const zone = quote?.zone || "near";
  // "Winning" reflects WHERE THE TICKER IS — above strike for an UP bet,
  // below strike for a DOWN bet. We deliberately do NOT use `pnl > 0`
  // here: the fair-value buyout carries a small built-in negative EV at
  // low |z|, so its sign would flip the win/loss badge even when the
  // ticker is plainly in the favourable band.
  const winning = quote != null ? quote.fav > 0 : false;

  const secs = Math.max(0, Math.ceil((new Date(bet.settle_at).getTime() - Date.now()) / 1000));
  const urgent = secs <= 10;

  // "If held to expiry in this zone" reference — the literal zone payoff at
  // the current band. Lets the trader see the haircut the buyout applies vs.
  // riding the position out.
  const pay = config?.zone?.pay;
  const holdRef = pay ? (() => {
    if (zone === "far")  return stake * (winning ?  +pay.koWin   : -pay.koLoss);
    if (zone === "mid")  return stake * (winning ?  +pay.midWin  : -pay.midLoss);
    if (zone === "near") return stake * (winning ?  +pay.nearWin : -pay.nearLoss);
    return null;
  })() : null;

  const fmtPrice = (p) =>
    p == null ? "—"
    : p >= 1000 ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p >= 1   ? p.toFixed(4)
    : p.toFixed(6);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* header chips */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-secondary/40 border border-border text-foreground">
            {bet.symbol}
          </span>
          <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
            isUp
              ? "bg-green-500/20 border-green-500/40 text-green-300"
              : "bg-red-500/20 border-red-500/40 text-red-300"
          }`}>
            <Arrow className="w-3 h-3" /> {isUp ? "UP" : "DOWN"}
          </span>
        </div>
        <span className={`text-[10px] uppercase tracking-widest ${urgent ? "text-red-300 animate-pulse" : "text-muted-foreground"}`}>
          {urgent ? "Final seconds" : "Active"}
        </span>
      </div>

      {/* numbers grid */}
      <div className="grid grid-cols-2 gap-3 font-mono">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Strike</div>
          <div className="text-base font-semibold text-foreground">{fmtPrice(strike)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stake</div>
          <div className="text-base font-semibold text-foreground">${stake.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Live</div>
          <div className="text-base font-semibold text-foreground">{fmtPrice(livePrice)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Move</div>
          <div className={`text-base font-semibold ${moveFav ? "text-green-400" : "text-red-400"}`}>
            {move >= 0 ? "+" : ""}{move.toFixed(3)}%
          </div>
        </div>
      </div>

      {/* current zone badge */}
      <div className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
        winning
          ? "border-green-500/40 bg-green-500/10"
          : "border-red-500/40 bg-red-500/10"
      }`}>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Current zone</span>
        <span className={`font-mono text-sm font-bold ${winning ? "text-green-300" : "text-red-300"}`}>
          {zoneLabel(zone).toUpperCase()} {winning ? "WIN" : "LOSS"}
        </span>
      </div>

      {/* time remaining */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Time remaining</span>
        <span className={`font-mono font-semibold ${urgent ? "text-red-300" : "text-foreground"}`}>
          {secs}s
        </span>
      </div>

      {/* big EXIT button — hero element. Colour follows the BUYOUT figure
          (not the ticker), so a red button always means "exiting now would
          lose you money" regardless of which band the price is in. */}
      <Button
        onClick={() => onExit?.(bet.id)}
        disabled={exiting === bet.id}
        className={`w-full h-24 flex flex-col items-center justify-center gap-0 px-2 font-grotesk ${
          pnl >= 0
            ? "bg-green-500/25 border border-green-500/50 text-green-300 hover:bg-green-500/35"
            : "bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25"
        }`}
      >
        {exiting === bet.id ? (
          <BoltLoader className="w-7 h-7" />
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-[0.15em] opacity-80 mb-1">
              Exit — fair-value buyout
            </span>
            <span className="text-3xl font-mono font-bold text-foreground leading-none">
              {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
            </span>
            {holdRef != null && (
              <span className="text-[10px] opacity-70 mt-1 font-mono">
                vs {holdRef >= 0 ? "+" : "−"}${Math.abs(holdRef).toFixed(2)} if held in {zoneLabel(zone)}
              </span>
            )}
          </>
        )}
      </Button>
    </div>
  );
}
