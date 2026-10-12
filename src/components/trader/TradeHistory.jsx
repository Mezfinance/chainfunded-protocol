/**
 * TradeHistory — Closed trade log with sortable columns.
 *
 * Displays completed trades with entry/exit prices, P&L (USDC and %),
 * duration, and trade direction. Supports column sorting and filtering.
 * Calculates real-time P&L from PriceContext for recently closed positions.
 */
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown, Share2 } from "lucide-react";
import { formatUtcDateTime } from "@/lib/datetime";
import { usePrices } from "@/lib/PriceContext";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import ShareTradeModal from "@/components/trader/ShareTradeModal";

function holdTime(open, close) {
  if (!open || !close) return null;
  const ms = new Date(close) - new Date(open);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 shrink-0" />
    : <ChevronDown className="w-3 h-3 shrink-0" />;
}

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort }) {
  return (
    <th
      className={`px-4 py-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-${align}`}
      onClick={() => onSort(col)}
    >
      <span className={`flex items-center gap-0.5 ${align === "right" ? "justify-end" : ""}`}>
        {align === "right" && <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />}
        {label}
        {align !== "right" && <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />}
      </span>
    </th>
  );
}

export default function TradeHistory({ trades }) {
  const { getPrice } = usePrices();
  const [shareTarget, setShareTarget] = useState(null); // trade being shared
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterDir, setFilterDir] = useState("all");

  const getLivePnl = (trade) => {
    if (trade.status !== "open") return trade.pnl;
    const sym = toPriceFeedSymbol(trade.symbol);
    const price = getPrice(sym);
    if (!price || !trade.entry_price || !trade.size) return undefined;
    const pct = (price - trade.entry_price) / trade.entry_price;
    return (trade.direction === "long" ? 1 : -1) * pct * trade.size;
  };

  const toggleSort = (col) => {
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    if (!trades) return [];
    let arr = [...trades];

    // Filters
    if (filterSymbol) arr = arr.filter(t => t.symbol?.toLowerCase().includes(filterSymbol.toLowerCase()));
    if (filterDir !== "all") arr = arr.filter(t => t.direction === filterDir);

    // Sort (use stored pnl for sort key; live pnl only in render)
    arr.sort((a, b) => {
      let av, bv;
      if (sortKey === "date") {
        av = new Date(a.close_time || a.open_time || 0).getTime();
        bv = new Date(b.close_time || b.open_time || 0).getTime();
      } else if (sortKey === "pnl") {
        av = a.pnl ?? -Infinity;
        bv = b.pnl ?? -Infinity;
      } else if (sortKey === "hold") {
        av = a.close_time && a.open_time ? new Date(a.close_time) - new Date(a.open_time) : -1;
        bv = b.close_time && b.open_time ? new Date(b.close_time) - new Date(b.open_time) : -1;
      } else if (sortKey === "symbol") {
        av = a.symbol || "";
        bv = b.symbol || "";
      } else if (sortKey === "direction") {
        av = a.direction || "";
        bv = b.direction || "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return arr;
  }, [trades, sortKey, sortDir, filterSymbol, filterDir]);

  if (!trades || trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <p className="text-muted-foreground text-sm">No trades yet. Start trading to see history here.</p>
      </div>
    );
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Trade History</h3>
        {/* Filter bar */}
        <div className="flex gap-2 items-center">
          <input
            value={filterSymbol}
            onChange={e => setFilterSymbol(e.target.value)}
            placeholder="Filter symbol…"
            className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-0.5">
            {[
              ["all", "All", "bg-primary/10 text-primary border-primary/30"],
              ["long", "L", "bg-green-500/20 text-green-400 border-green-500/30"],
              ["short", "S", "bg-red-500/20 text-red-400 border-red-500/30"],
            ].map(([val, label, activeClass]) => (
              <button
                key={val}
                onClick={() => setFilterDir(val)}
                className={`px-2 py-1 text-xs rounded font-medium border transition-all ${
                  filterDir === val
                    ? `${activeClass} border`
                    : "bg-secondary text-muted-foreground border-transparent hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <SortTh col="symbol" label="Symbol" {...sortProps} />
              <SortTh col="direction" label="Dir." {...sortProps} />
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Entry</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Exit</th>
              <SortTh col="pnl" label="P&L" align="right" {...sortProps} />
              <SortTh col="hold" label="Hold" align="right" {...sortProps} />
              <SortTh col="date" label="Date" align="right" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((trade) => {
              const pnl = getLivePnl(trade);
              const hold = holdTime(trade.open_time, trade.close_time);
              return (
                <tr key={trade.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{trade.symbol}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={`text-xs ${trade.direction === "long"
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : "bg-red-500/10 text-red-400 border-red-500/30"}`}
                      variant="outline"
                    >
                      {trade.direction === "long"
                        ? <TrendingUp className="w-3 h-3 mr-1" />
                        : <TrendingDown className="w-3 h-3 mr-1" />}
                      {trade.direction}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    ${trade.entry_price?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {trade.exit_price ? `$${trade.exit_price?.toLocaleString()}` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${
                    pnl != null
                      ? pnl >= 0 ? "text-green-400" : "text-red-400"
                      : "text-muted-foreground"
                  }`}>
                    {pnl != null ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                    {trade.status === "open" && pnl != null && (
                      <span className="text-xs ml-1 opacity-60">(live)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {hold ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {trade.close_time ? formatUtcDateTime(trade.close_time) : "Open"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {trade.status === "closed" && (
                      <button
                        onClick={() => setShareTarget(trade)}
                        title="Share trade"
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Share trade"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No trades match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shareTarget && (
        <ShareTradeModal trade={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  );
}
