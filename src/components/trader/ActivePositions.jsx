/**
 * ActivePositions — Open position management table.
 *
 * Displays all open trades with real-time P&L calculated from live prices
 * (via PriceContext). Supports closing positions (full/partial), modifying
 * SL/TP levels, and shows per-position margin usage. Syncs position state
 * to Base44 and Supabase on close.
 */
import { useState, useEffect, useRef, Fragment } from "react";
import { base44 } from "@/api/base44Client";
import { syncTrade, syncAccount, supabase } from "@/lib/supabaseClient";
import { workerPost } from "@/lib/workerApi";
import { TrendingUp, TrendingDown, Plus, Minus, Shield } from "lucide-react";
import { usePrices } from "@/lib/PriceContext";
import { toPriceFeedSymbol } from "@/lib/assetConfig";
import { toast } from "sonner";

function calcLiqPrice(entryPrice, leverage, direction) {
  if (!leverage || leverage <= 1) return null;
  if (direction === "long") return entryPrice * (1 - 0.95 / leverage);
  return entryPrice * (1 + 0.95 / leverage);
}

function calcPnl(trade, currentPrice) {
  if (!currentPrice || !trade.entry_price || !trade.size) return null;
  const pct = (currentPrice - trade.entry_price) / trade.entry_price;
  return (trade.direction === "long" ? 1 : -1) * pct * trade.size;
}

function fmtPrice(p) {
  if (p == null) return "N/A";
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return "$" + p.toFixed(4);
  return "$" + p.toFixed(5);
}

export default function ActivePositions({ account, apiSecret, refreshKey, onPositionClosed, currentSymbol = null, hideOtherPairs = false, selectedId = null, onSelect }) {
  const [trades, setTrades] = useState([]);
  // Trade ids closed by this tab's user-initiated handleClose. The realtime
  // UPDATE that lands a moment later should NOT fire the auto-close toast for
  // these — handleClose already shows its own success toast.
  const manuallyClosedRef = useRef(new Set());
  const [closing, setClosing] = useState(null);
  const { getPrice } = usePrices();
  const [marginEdit, setMarginEdit] = useState(null); // { id, mode: 'add'|'reduce', amount: '' }
  const [marginLoading, setMarginLoading] = useState(false);
  const [slTpEdit, setSlTpEdit] = useState(null); // { id, sl: '', tp: '' }
  const [slTpLoading, setSlTpLoading] = useState(false);

  const load = async () => {
    if (!account?.id) return;
    const data = await base44.entities.Trade.filter({ account_id: account.id, status: "open" });
    setTrades(data);
  };

  useEffect(() => { load(); }, [account?.id, refreshKey]);

  // Realtime: react to trades that the worker closed (SL/TP, drawdown, manual
  // close from another tab) so the table updates without a page refresh.
  useEffect(() => {
    if (!account?.id) return undefined;
    const channel = supabase
      .channel(`trades-${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `account_id=eq.${account.id}` },
        (payload) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          const justClosed =
            newRow?.status === "closed" && oldRow?.status === "open";

          if (justClosed) {
            const wasManual = manuallyClosedRef.current.delete(newRow.id);
            if (!wasManual) {
              const pnl = Number(newRow.pnl ?? 0);
              const sign = pnl >= 0 ? "+" : "−";
              const pnlStr = `${sign}$${Math.abs(pnl).toFixed(2)}`;
              toast(`${newRow.symbol} closed: ${pnlStr}`, {
                description: "Closed by the platform",
              });
            }
            // Drop the closed trade from the local table immediately —
            // matches what the manual-close path does. Then bubble to
            // parent so balances/equity refresh.
            setTrades((prev) => prev.filter((t) => t.id !== newRow.id));
            onPositionClosed?.();
          } else {
            // SL/TP edit, fill, or any other change — refresh just this table.
            load();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // load and onPositionClosed are stable for our purposes; account?.id is the
    // only thing that should re-bind the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const handleMarginSubmit = async (trade) => {
    if (!marginEdit?.amount || isNaN(parseFloat(marginEdit.amount))) return;
    setMarginLoading(true);
    try {
      if (!apiSecret) throw new Error("Account secret not ready — please try again");

      const res = await workerPost("/trade/margin", {
        trade_id:   trade.id,
        account_id: account.id,
        api_secret: apiSecret,
        mode:       marginEdit.mode,
        amount:     parseFloat(marginEdit.amount),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);
      if (data?.size) syncTrade(trade.id, { size: data.size });
      setMarginEdit(null);
      load();
    } catch (err) {
      toast.error("Margin update failed", {
        description: err?.message || "Could not update margin. Please try again.",
      });
    } finally {
      setMarginLoading(false);
    }
  };

  const handleSlTpSubmit = async (trade) => {
    const sl = slTpEdit.sl ? parseFloat(slTpEdit.sl) : null;
    const tp = slTpEdit.tp ? parseFloat(slTpEdit.tp) : null;
    // Guard against SL/TP placed on the wrong side of entry — these would
    // trigger on the very next price tick, stopping the trader out before
    // the position has had any chance to move. Clearing (both null) is fine.
    const entry = trade.entry_price;
    if (entry) {
      const isLong = trade.direction === "long";
      const fmtEntry = `$${entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      if (sl != null) {
        const slOk = isLong ? sl < entry : sl > entry;
        if (!slOk) {
          toast.error("Stop Loss on wrong side of entry", {
            description: isLong
              ? `Long SL must be below entry (${fmtEntry})`
              : `Short SL must be above entry (${fmtEntry})`,
          });
          return;
        }
      }
      if (tp != null) {
        const tpOk = isLong ? tp > entry : tp < entry;
        if (!tpOk) {
          toast.error("Take Profit on wrong side of entry", {
            description: isLong
              ? `Long TP must be above entry (${fmtEntry})`
              : `Short TP must be below entry (${fmtEntry})`,
          });
          return;
        }
      }
    }
    setSlTpLoading(true);
    try {
      if (!apiSecret) throw new Error("Account secret not ready — please try again");

      const res = await workerPost("/trade/sltp", {
        trade_id:   trade.id,
        account_id: account.id,
        api_secret: apiSecret,
        sl:         sl || null,
        tp:         tp || null,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);
      syncTrade(trade.id, { sl: sl || null, tp: tp || null });
      toast.success("SL/TP updated");
      setSlTpEdit(null);
      load();
    } catch (err) {
      toast.error("SL/TP update failed", {
        description: err?.message || "Could not update SL/TP. Please try again.",
      });
    } finally {
      setSlTpLoading(false);
    }
  };

  const handleClose = async (trade) => {
    setClosing(trade.id);
    // Mark so the realtime UPDATE for this trade.id skips the auto-close
    // toast — handleClose shows its own success toast on completion.
    manuallyClosedRef.current.add(trade.id);
    try {
      // Route through the worker so exit price comes from the authoritative
      // Pyth feed and the ledger entry is written server-side
      if (!apiSecret) throw new Error("Account secret not ready — please try again");

      const res = await workerPost("/trade/close", {
        trade_id: trade.id,
        account_id: account.id,
        api_secret: apiSecret,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);

      const { pnl, exit_price: exitPrice, pnl_pct } = data;
      const closeTime = new Date().toISOString();
      syncTrade(trade.id, { status: "closed", exit_price: exitPrice, pnl, pnl_pct, close_time: closeTime });

      const newBalance   = (account.current_balance  ?? 0) + pnl;
      const newDailyLoss = (account.daily_loss_today ?? 0) + Math.min(0, pnl);
      syncAccount(account.id, { current_balance: newBalance, daily_loss_today: newDailyLoss });

      toast.success(`Position closed · ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
      load();
      onPositionClosed?.();
    } catch (err) {
      toast.error("Close failed", {
        description: err?.message || "Could not close position. Please try again.",
      });
    } finally {
      setClosing(null);
    }
  };

  // Filter trades by current symbol when "Hide Other Pairs" is on.
  const visibleTrades = account && hideOtherPairs && currentSymbol
    ? trades.filter(t => t.symbol === currentSymbol)
    : (account ? trades : []);

  return (
    <div className="space-y-3">
      {/* Horizontal positions table — headers persist even when empty so the
          panel reads as a structured table rather than a bare message. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="font-semibold px-2 py-2">Symbol</th>
                <th className="font-semibold px-2 py-2">Side</th>
                <th className="font-semibold px-2 py-2 text-right">Size</th>
                <th className="font-semibold px-2 py-2 text-right">Entry</th>
                <th className="font-semibold px-2 py-2 text-right">Mark</th>
                <th className="font-semibold px-2 py-2 text-right">Liq.</th>
                <th className="font-semibold px-2 py-2 text-right">Margin</th>
                <th className="font-semibold px-2 py-2 text-right">SL / TP</th>
                <th className="font-semibold px-2 py-2 text-right">PnL (USDT)</th>
                <th className="font-semibold px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrades.map(trade => {
                const sym = toPriceFeedSymbol(trade.symbol);
                const livePrice = getPrice(sym);
                const pnl = calcPnl(trade, livePrice);
                const margin = (trade.leverage || 1) > 0 ? trade.size / (trade.leverage || 1) : trade.size;
                const pnlPct = pnl != null && margin > 0 ? (pnl / margin) * 100 : null;
                const liqPrice = calcLiqPrice(trade.entry_price, trade.leverage || 1, trade.direction);
                const isLong = trade.direction === "long";
                const pnlPositive = pnl == null ? null : pnl >= 0;
                const isEditing = slTpEdit?.id === trade.id || marginEdit?.id === trade.id;

                return (
                  <Fragment key={trade.id}>
                    <tr
                      onClick={() => onSelect?.(trade.id)}
                      className={`border-b border-border/40 transition-colors ${onSelect ? "cursor-pointer" : ""} ${
                        selectedId === trade.id
                          ? "bg-primary/10 hover:bg-primary/15"
                          : "hover:bg-secondary/20"
                      }`}
                    >
                      <td className="px-2 py-2 font-bold text-foreground whitespace-nowrap">{trade.symbol}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${isLong ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                          {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isLong ? "LONG" : "SHORT"}{(trade.leverage || 1) > 1 ? ` ${trade.leverage}×` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-foreground whitespace-nowrap">${(trade.size || 0).toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground whitespace-nowrap">{fmtPrice(trade.entry_price)}</td>
                      <td className="px-2 py-2 text-right text-foreground whitespace-nowrap">{livePrice ? fmtPrice(livePrice) : "…"}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground whitespace-nowrap">{liqPrice ? fmtPrice(liqPrice) : "—"}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground whitespace-nowrap">${margin.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-[11px]">
                        <span className="text-red-400">{trade.sl ? fmtPrice(trade.sl) : "—"}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-green-400">{trade.tp ? fmtPrice(trade.tp) : "—"}</span>
                      </td>
                      <td className={`px-2 py-2 text-right font-bold whitespace-nowrap ${pnl == null ? "text-muted-foreground" : pnlPositive ? "text-green-400" : "text-red-400"}`}>
                        {pnl != null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "…"}
                        {pnlPct != null && (
                          <span className="block text-[10px] font-medium opacity-80">
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSlTpEdit(slTpEdit?.id === trade.id ? null : { id: trade.id, sl: trade.sl ? String(trade.sl) : "", tp: trade.tp ? String(trade.tp) : "" })}
                            className="p-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                            title="Edit SL / TP"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setMarginEdit(marginEdit?.id === trade.id ? null : { id: trade.id, mode: "add", amount: "" })}
                            className="p-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                            title="Adjust margin"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onPointerDown={(e) => {
                              if (closing === trade.id || !livePrice) return;
                              e.preventDefault();
                              handleClose(trade);
                            }}
                            disabled={closing === trade.id || !livePrice}
                            className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!livePrice ? "Waiting for live price…" : "Close at market"}
                          >
                            {closing === trade.id ? "…" : "Close"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable edit row */}
                    {isEditing && (
                      <tr className="border-b border-border/40 bg-secondary/20">
                        <td colSpan={10} className="px-3 py-2.5">
                          {slTpEdit?.id === trade.id && (
                            <div className="flex flex-wrap items-end gap-2">
                              <div>
                                <label className="text-[10px] text-red-400 mb-0.5 block">Stop Loss</label>
                                <input
                                  type="number"
                                  placeholder={trade.sl ? String(trade.sl) : "Price"}
                                  value={slTpEdit.sl}
                                  onChange={e => setSlTpEdit(s => ({ ...s, sl: e.target.value }))}
                                  className="w-32 bg-secondary border border-red-500/20 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-green-400 mb-0.5 block">Take Profit</label>
                                <input
                                  type="number"
                                  placeholder={trade.tp ? String(trade.tp) : "Price"}
                                  value={slTpEdit.tp}
                                  onChange={e => setSlTpEdit(s => ({ ...s, tp: e.target.value }))}
                                  className="w-32 bg-secondary border border-green-500/20 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
                                />
                              </div>
                              <button
                                onClick={() => handleSlTpSubmit(trade)}
                                disabled={slTpLoading || (!slTpEdit.sl && !slTpEdit.tp)}
                                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-semibold disabled:opacity-50"
                              >
                                {slTpLoading ? "…" : "Save SL/TP"}
                              </button>
                              {(trade.sl || trade.tp) && (
                                <button
                                  onClick={() => { setSlTpEdit(s => ({ ...s, sl: "", tp: "" })); handleSlTpSubmit(trade); }}
                                  disabled={slTpLoading}
                                  className="px-3 py-1.5 text-xs border border-red-500/30 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  Clear
                                </button>
                              )}
                              <button
                                onClick={() => setSlTpEdit(null)}
                                className="px-3 py-1.5 text-xs border border-border rounded text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          {marginEdit?.id === trade.id && (
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="flex gap-1">
                                {["add", "reduce"].map(mode => (
                                  <button
                                    key={mode}
                                    onClick={() => setMarginEdit(e => ({ ...e, mode }))}
                                    className={`px-3 py-1.5 text-xs rounded font-semibold capitalize border transition-all ${marginEdit.mode === mode ? (mode === "add" ? "bg-green-500/10 border-green-500/40 text-green-400" : "bg-red-500/10 border-red-500/40 text-red-400") : "border-border text-muted-foreground hover:text-foreground"}`}
                                  >
                                    {mode === "add" ? <span className="flex items-center gap-1"><Plus className="w-3 h-3" />Add</span> : <span className="flex items-center gap-1"><Minus className="w-3 h-3" />Reduce</span>}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="number"
                                placeholder="Amount USDT"
                                value={marginEdit.amount}
                                onChange={e => setMarginEdit(me => ({ ...me, amount: e.target.value }))}
                                className="w-36 bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <button
                                onClick={() => handleMarginSubmit(trade)}
                                disabled={marginLoading || !marginEdit.amount}
                                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-semibold disabled:opacity-50"
                              >
                                {marginLoading ? "…" : "Apply"}
                              </button>
                              <button
                                onClick={() => setMarginEdit(null)}
                                className="px-3 py-1.5 text-xs border border-border rounded text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
        </table>
      </div>

      {visibleTrades.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          {!account
            ? "Select an account to view positions"
            : hideOtherPairs && currentSymbol
            ? `No open positions for ${currentSymbol}`
            : "No open positions"}
        </p>
      )}
    </div>
  );
}