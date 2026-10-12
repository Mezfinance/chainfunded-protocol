import { TrendingUp, TrendingDown, ShieldCheck } from "lucide-react";

function fmtPrice(p) {
  if (p == null) return "—";
  const n = Number(p);
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPnl(pnl) {
  if (pnl == null) return "—";
  const n = Number(pnl);
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(pct) {
  if (pct == null) return null;
  const n = Number(pct);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function holdTime(open, close) {
  if (!open || !close) return null;
  const ms = new Date(close) - new Date(open);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Verified trade card. Rendered when a community message carries a
 * payload of kind "trade_share" — either user-shared (post via
 * /community/share-trade) or auto-shared by the worker for big closes.
 *
 * The Verified badge signals the data came straight from the trades
 * table — not user-input numbers.
 */
export default function TradeShareCard({ payload }) {
  if (!payload) return null;
  const isLong = payload.direction === "long";
  const profitable = Number(payload.pnl) >= 0;
  const Arrow = isLong ? TrendingUp : TrendingDown;
  const hold = holdTime(payload.open_time, payload.close_time);

  return (
    <div className={`mt-2 rounded-lg border p-3 ${profitable ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
      <div className="flex items-center gap-2">
        <Arrow className={`w-4 h-4 ${isLong ? "text-emerald-400" : "text-rose-400"}`} />
        <span className="text-sm font-bold text-foreground">{payload.symbol}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
          isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
        }`}>
          {isLong ? "Long" : "Short"}{payload.leverage > 1 ? ` ${payload.leverage}×` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
          <ShieldCheck className="w-3 h-3" /> Verified
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Entry</div>
          <div className="text-sm font-mono text-foreground">{fmtPrice(payload.entry_price)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Exit</div>
          <div className="text-sm font-mono text-foreground">{fmtPrice(payload.exit_price)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">P&amp;L</div>
          <div className={`text-sm font-mono font-semibold ${profitable ? "text-emerald-400" : "text-rose-400"}`}>
            {fmtPnl(payload.pnl)}
            {payload.pnl_pct != null && (
              <span className="text-[10px] ml-1 opacity-80">{fmtPct(payload.pnl_pct)}</span>
            )}
          </div>
        </div>
      </div>

      {(payload.size != null || hold) && (
        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
          {payload.size != null && <span>Size ${Number(payload.size).toLocaleString()}</span>}
          {hold && <span>· Held {hold}</span>}
        </div>
      )}
    </div>
  );
}
