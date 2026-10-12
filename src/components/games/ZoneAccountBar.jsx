import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
import InfoHint from "@/components/ui/InfoHint";

const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Module-scoped so it isn't recreated on every render — an inline component
// definition remounts the subtree each tick and would instantly close the
// InfoHint popovers.
function Cell({ label, hint, value, cls }) {
  return (
    <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        {hint && <InfoHint text={hint} />}
      </div>
      <div className={`font-semibold ${cls || "text-foreground"}`}>{value}</div>
    </div>
  );
}

/**
 * ZoneAccountBar — account snapshot shown while placing zone bets.
 *
 * Uses the zone-trading page's already-derived figures (which fold in open + pending
 * margin, zone reserve, and unrealised P&L) so the numbers match the worker.
 *
 * Two drawdown buffers: "today" (measured from the day's opening balance,
 * resets at 00:00 UTC) and "total" (measured from the starting balance, for
 * the life of the account). Each is how much equity can still be lost before
 * that limit breaches and the account fails.
 */
export default function ZoneAccountBar({ account, unrealisedPnl = 0, marginInUse = 0, reserved = 0, available = 0, drawdown, compact = false }) {
  if (!account) return null;

  const balance = account.current_balance ?? account.account_size ?? 0;
  const starting = account.starting_balance ?? account.account_size ?? balance;
  const equity = balance + unrealisedPnl;
  const totalPnl = equity - starting;
  const totalPnlPct = starting > 0 ? (totalPnl / starting) * 100 : 0;
  const equityUp = equity >= balance;
  const totalUp = totalPnl >= 0;

  let dailyBuf = null, totalBuf = null, dailyPct = 5, totalPct = 10;
  if (drawdown && drawdown.startBal > 0) {
    dailyPct = drawdown.dailyPct;
    totalPct = drawdown.totalPct;
    const dailyLimit = (dailyPct / 100) * drawdown.startBal;
    const totalLimit = (totalPct / 100) * drawdown.startBal;
    dailyBuf = Math.max(0, equity - (drawdown.dayStart - dailyLimit));
    totalBuf = Math.max(0, equity - (drawdown.startBal - totalLimit));
  }
  const thin = (v) => v != null && v < starting * 0.02;

  // One-line ticker (used by the action-bar layout).
  if (compact) {
    const items = [
      { label: "Equity", value: usd(equity), cls: equityUp ? "text-green-400" : "text-red-400", hint: "Balance + unrealised P&L from open positions" },
      { label: "Balance", value: usd(balance), cls: "text-foreground", hint: "Realised balance, excluding open-position P&L" },
      { label: "Avail", value: usd(available), cls: available < balance * 0.1 ? "text-red-400" : "text-green-400", hint: "Free capital for new bets (balance − margin − in bets)" },
      ...(dailyBuf != null ? [{ label: "Daily buf", value: usd(dailyBuf), cls: thin(dailyBuf) ? "text-red-400" : "text-foreground", hint: `Equity you can still lose TODAY before breaching the ${dailyPct}% daily drawdown. Resets at 00:00 UTC.` }] : []),
      ...(totalBuf != null ? [{ label: "Total buf", value: usd(totalBuf), cls: thin(totalBuf) ? "text-red-400" : "text-foreground", hint: `Equity you can still lose before breaching the ${totalPct}% total drawdown (account lifetime).` }] : []),
      { label: "P&L", value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%)`, cls: totalUp ? "text-green-400" : "text-red-400", hint: "Profit or loss vs the account's starting balance" },
    ];
    return (
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs">
        <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1">
            <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">{it.label}</span>
            <InfoHint text={it.hint} />
            <span className={`font-semibold ${it.cls}`}>{it.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-secondary/40 border border-border rounded-xl p-3 space-y-3">
      {/* Equity */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Equity</span>
          <InfoHint text="Balance + unrealised P&L from open positions" />
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold font-grotesk ${equityUp ? "text-green-400" : "text-red-400"}`}>
            {usd(equity)}
          </div>
          {unrealisedPnl !== 0 && (
            <div className={`text-xs flex items-center justify-end gap-0.5 ${equityUp ? "text-green-400" : "text-red-400"}`}>
              {equityUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {unrealisedPnl >= 0 ? "+" : ""}{unrealisedPnl.toFixed(2)} unrealised
            </div>
          )}
        </div>
      </div>

      {/* Balances + margin */}
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <Cell label="Balance" hint="Realised balance, excluding open-position P&L" value={usd(balance)} />
        <Cell label="Margin" hint="Collateral locked in open positions and pending orders" value={usd(marginInUse)} cls={marginInUse > 0 ? "text-yellow-400" : "text-foreground"} />
        <Cell label="In positions" hint="Margin committed to live 60s positions" value={usd(reserved)} cls={reserved > 0 ? "text-yellow-400" : "text-foreground"} />
        <Cell label="Available" hint="Free capital for new bets (balance − margin − in bets)" value={usd(available)} cls={available < balance * 0.1 ? "text-red-400" : "text-green-400"} />
        {dailyBuf != null && (
          <Cell
            label="Daily buffer"
            hint={`Equity you can still lose TODAY before breaching the ${dailyPct}% daily drawdown and failing the account. Resets at 00:00 UTC.`}
            value={usd(dailyBuf)}
            cls={thin(dailyBuf) ? "text-red-400" : "text-foreground"}
          />
        )}
        {totalBuf != null && (
          <Cell
            label="Total buffer"
            hint={`Equity you can still lose before breaching the ${totalPct}% total drawdown (account lifetime) and failing the account.`}
            value={usd(totalBuf)}
            cls={thin(totalBuf) ? "text-red-400" : "text-foreground"}
          />
        )}
      </div>

      {dailyBuf != null && (
        <p className="text-[10px] text-muted-foreground text-center">
          Daily buffer resets at 00:00 UTC · Total buffer is for the life of the account
        </p>
      )}

      {/* Total P&L */}
      <div className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${totalUp ? "bg-green-500/5 border border-green-500/15" : "bg-red-500/5 border border-red-500/15"}`}>
        <span className="text-muted-foreground flex items-center gap-1">
          Total P&L
          <InfoHint text="Profit or loss vs the account's starting balance" />
        </span>
        <span className={`font-semibold ${totalUp ? "text-green-400" : "text-red-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
