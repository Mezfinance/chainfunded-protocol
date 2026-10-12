import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { syncTrade, supabase } from "@/lib/supabaseClient";
import { workerPost } from "@/lib/workerApi";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export default function PendingOrders({ account, apiSecret, refreshKey, onCancelled, currentSymbol = null, hideOtherPairs = false, onCountChange }) {
  const [orders, setOrders] = useState([]);
  const [cancelling, setCancelling] = useState(null);

  const load = async () => {
    if (!account?.id) return;
    try {
      const data = await base44.entities.Trade.filter({
        account_id: account.id,
        status: "pending",
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => { load(); }, [account?.id, refreshKey]);

  // Realtime: drop orders when the worker fills or cancels them. The
  // ActivePositions component has its own subscription that picks the new
  // open trade up — no need to call onCancelled here for the fill case.
  useEffect(() => {
    if (!account?.id) return undefined;
    const channel = supabase
      .channel(`pending-${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `account_id=eq.${account.id}` },
        (payload) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          const justFilled    = newRow?.status === "open"      && oldRow?.status === "pending";
          const justCancelled = newRow?.status === "cancelled" && oldRow?.status === "pending";

          if (justFilled || justCancelled) {
            setOrders((prev) => prev.filter((o) => o.id !== newRow.id));
            if (justFilled) {
              const fillPrice = newRow.entry_price;
              toast.success(`${newRow.symbol} order filled`, {
                description: fillPrice != null
                  ? `Filled at $${Number(fillPrice).toFixed(2)}`
                  : "Now an open position",
              });
            }
          } else if (payload.eventType === "INSERT" && newRow?.status === "pending") {
            // New pending order created in another tab — refresh.
            load();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const handleCancel = async (order) => {
    setCancelling(order.id);
    try {
      if (!apiSecret) throw new Error("Account secret not ready — please reload the terminal");

      const res = await workerPost("/order/cancel", {
        order_id:   order.id,
        account_id: account.id,
        api_secret: apiSecret,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);

      syncTrade(order.id, { status: "cancelled" });
      toast.success("Order cancelled");
      load();
      onCancelled?.();
    } catch (err) {
      toast.error("Cancel failed", {
        description: err?.message || "Could not cancel order. Please try again.",
      });
    } finally {
      setCancelling(null);
    }
  };

  // Filter by current symbol when "Hide Other Pairs" is on.
  const visibleOrders = account && hideOtherPairs && currentSymbol
    ? orders.filter(o => o.symbol === currentSymbol)
    : (account ? orders : []);

  // Bubble the count up to a parent (used by the tab strip in TerminalBottomPanel).
  useEffect(() => {
    if (typeof onCountChange === "function") onCountChange(visibleOrders.length);
  }, [visibleOrders.length, onCountChange]);

  return (
    <div className="space-y-3">
      {/* Horizontal orders table — headers persist even when empty so the
          panel reads as a structured table rather than a bare message. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="font-semibold px-2 py-2">Symbol</th>
                <th className="font-semibold px-2 py-2">Side</th>
                <th className="font-semibold px-2 py-2">Type</th>
                <th className="font-semibold px-2 py-2 text-right">Size</th>
                <th className="font-semibold px-2 py-2 text-right">Limit</th>
                <th className="font-semibold px-2 py-2 text-right">Stop</th>
                <th className="font-semibold px-2 py-2 text-right">SL / TP</th>
                <th className="font-semibold px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map(order => {
                const isLong = order.direction === "long";
                const orderLabel = order.order_type === "stop_limit" ? "Stop-Limit" : "Limit";
                return (
                  <tr key={order.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                    <td className="px-2 py-2 font-bold text-foreground whitespace-nowrap">{order.symbol}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${isLong ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                        {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isLong ? "LONG" : "SHORT"}{(order.leverage || 1) > 1 ? ` ${order.leverage}×` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">{orderLabel}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-foreground whitespace-nowrap">${(order.size || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-foreground whitespace-nowrap">
                      ${order.limit_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground whitespace-nowrap">
                      {order.stop_price ? `$${order.stop_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap text-[11px]">
                      <span className="text-red-400">{order.sl ? order.sl.toLocaleString() : "—"}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-green-400">{order.tp ? order.tp.toLocaleString() : "—"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleCancel(order)}
                          disabled={cancelling === order.id}
                          className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-40 inline-flex items-center gap-1"
                          title="Cancel order"
                        >
                          {cancelling === order.id ? "…" : <><X className="w-3 h-3" /> Cancel</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </table>
      </div>

      {visibleOrders.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          {!account
            ? "Select an account to view orders"
            : hideOtherPairs && currentSymbol
            ? `No pending orders for ${currentSymbol}`
            : "No pending orders"}
        </p>
      )}
    </div>
  );
}
