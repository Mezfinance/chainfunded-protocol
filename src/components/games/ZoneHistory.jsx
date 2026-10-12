import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { zoneBuyout } from "@/lib/zoneTrades";

const RESULT_STYLES = {
  win:    "text-green-400",
  loss:   "text-red-400",
  refund: "text-muted-foreground",
};

function CountdownRow({ bet, getPrice, config }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = new Date(bet.settle_at).getTime() - Date.now();
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const live = getPrice?.(toPriceFeedSymbol(bet.symbol));
  const strike = Number(bet.strike_price);
  const winning = live != null ? zoneBuyout(bet, live, config).pnl > 0 : null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2">
      <div className="flex items-center gap-2">
        {bet.direction === "up"
          ? <TrendingUp className="w-4 h-4 text-green-400" />
          : <TrendingDown className="w-4 h-4 text-red-400" />}
        <div>
          <p className="text-xs font-medium text-foreground">{bet.symbol}</p>
          <p className="text-[11px] text-muted-foreground font-mono">
            entry ${strike.toLocaleString(undefined, { maximumFractionDigits: 6 })} · ${Number(bet.stake).toFixed(2)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm text-foreground">{remaining}s</p>
        {winning != null && (
          <p className={`text-[11px] font-medium ${winning ? "text-green-400" : "text-red-400"}`}>
            {winning ? "winning" : "losing"}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ZoneHistory({ bets, getPrice, config }) {
  const pending = bets.filter((b) => b.status === "pending");
  const settled = bets.filter((b) => b.status !== "pending");

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Open positions</p>
          {pending.map((b) => <CountdownRow key={b.id} bet={b} getPrice={getPrice} config={config} />)}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
        {settled.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No closed trades yet.</p>
        )}
        {settled.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              {b.direction === "up"
                ? <TrendingUp className="w-4 h-4 text-muted-foreground" />
                : <TrendingDown className="w-4 h-4 text-muted-foreground" />}
              <div>
                <p className="text-xs font-medium text-foreground">{b.symbol} · {b.direction.toUpperCase()}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  ${Number(b.strike_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  {b.settle_price != null && ` → $${Number(b.settle_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-mono text-sm font-medium ${RESULT_STYLES[b.status] || "text-foreground"}`}>
                {b.status === "refund"
                  ? "Refund"
                  : `${(b.pnl ?? 0) >= 0 ? "+" : ""}$${Number(b.pnl ?? 0).toFixed(2)}`}
              </p>
              <p className="text-[11px] text-muted-foreground capitalize">
                {b.status}{b.settled_zone ? ` · ${b.settled_zone} zone` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
