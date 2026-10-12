import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { usePrices } from "@/lib/PriceContext";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import InfoHint from "@/components/ui/InfoHint";

function calcUnrealisedPnl(trade, currentPrice) {
  if (!currentPrice || !trade.entry_price || !trade.size) return 0;
  const pct = (currentPrice - trade.entry_price) / trade.entry_price;
  return (trade.direction === "long" ? 1 : -1) * pct * trade.size;
}

export default function AccountBalanceBar({ account, openTrades = [], compact = false }) {
  const { getPrice } = usePrices();

  const stats = useMemo(() => {
    const balance = account?.current_balance ?? account?.account_size ?? 0;
    const startingBalance = account?.starting_balance ?? account?.account_size ?? balance;

    // Total margin locked across all open positions
    const totalMarginUsed = openTrades.reduce((sum, t) => {
      const lev = t.leverage || 1;
      return sum + (t.size || 0) / lev;
    }, 0);

    const availableBalance = balance - totalMarginUsed;

    // Unrealised PnL across ALL open positions using live WebSocket prices
    const unrealisedPnl = openTrades.reduce((sum, t) => {
      const sym = toPriceFeedSymbol(t.symbol);
      return sum + calcUnrealisedPnl(t, getPrice(sym));
    }, 0);

    const liveEquity = balance + unrealisedPnl;
    const totalPnl = liveEquity - startingBalance;
    const totalPnlPct = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;

    return { balance, availableBalance, totalMarginUsed, unrealisedPnl, liveEquity, totalPnl, totalPnlPct };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, openTrades, getPrice]);

  if (!account) return null;

  const equityUp = stats.liveEquity >= stats.balance;
  const totalUp = stats.totalPnl >= 0;

  // Horizontal compact variant — sits in the thin band above the chart.
  if (compact) {
    return (
      <div className="flex items-center gap-4 px-4 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Equity</span>
          <span className={`font-bold font-grotesk ${equityUp ? "text-green-400" : "text-red-400"}`}>
            ${stats.liveEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Balance</span>
          <span className="text-foreground font-semibold">
            ${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Margin</span>
          <span className={`font-semibold ${stats.totalMarginUsed > 0 ? "text-yellow-400" : "text-foreground"}`}>
            ${stats.totalMarginUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Available</span>
          <span className={`font-semibold ${stats.availableBalance < stats.balance * 0.1 ? "text-red-400" : "text-green-400"}`}>
            ${stats.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">P&amp;L</span>
          <span className={`font-semibold ${totalUp ? "text-green-400" : "text-red-400"}`}>
            {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toFixed(2)} ({stats.totalPnlPct >= 0 ? "+" : ""}{stats.totalPnlPct.toFixed(2)}%)
          </span>
        </div>
        {stats.unrealisedPnl !== 0 && (
          <>
            <span className="text-border">·</span>
            <div className="flex items-center gap-1">
              {equityUp ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
              <span className={`font-medium ${equityUp ? "text-green-400" : "text-red-400"}`}>
                {stats.unrealisedPnl >= 0 ? "+" : ""}{stats.unrealisedPnl.toFixed(2)} unrealised
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-secondary/40 border border-border rounded-xl p-3 mb-4 space-y-3">
      {/* Top row: live equity */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Equity</span>
          <InfoHint text="Balance + unrealised P&L from all open positions" />
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold font-grotesk ${equityUp ? "text-green-400" : "text-red-400"}`}>
            ${stats.liveEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {stats.unrealisedPnl !== 0 && (
            <div className={`text-xs flex items-center justify-end gap-0.5 ${equityUp ? "text-green-400" : "text-red-400"}`}>
              {equityUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {stats.unrealisedPnl >= 0 ? "+" : ""}{stats.unrealisedPnl.toFixed(2)} unrealised
            </div>
          )}
        </div>
      </div>

      {/* Stats grid — two lines each: label + ⓘ on top, value below */}
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="text-muted-foreground">Balance</span>
            <InfoHint text="Current account balance excluding unrealised P&L from open positions" />
          </div>
          <div className="text-foreground font-semibold">
            ${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="text-muted-foreground">Margin</span>
            <InfoHint text="Total collateral locked across all open positions" />
          </div>
          <div className={`font-semibold ${stats.totalMarginUsed > 0 ? "text-yellow-400" : "text-foreground"}`}>
            ${stats.totalMarginUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-background/50 rounded-lg px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="text-muted-foreground">Available</span>
            <InfoHint text="Funds available for new trades (balance minus margin used)" />
          </div>
          <div className={`font-semibold ${stats.availableBalance < stats.balance * 0.1 ? "text-red-400" : "text-green-400"}`}>
            ${stats.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Overall P&L vs starting balance */}
      <div className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${totalUp ? "bg-green-500/5 border border-green-500/15" : "bg-red-500/5 border border-red-500/15"}`}>
        <span className="text-muted-foreground flex items-center gap-1">Total P&L
          <InfoHint text="Total profit or loss since account was created" />
        </span>
        <span className={`font-semibold ${totalUp ? "text-green-400" : "text-red-400"}`}>
          {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toFixed(2)} ({stats.totalPnlPct >= 0 ? "+" : ""}{stats.totalPnlPct.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}