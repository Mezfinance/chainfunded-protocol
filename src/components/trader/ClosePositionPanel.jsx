/**
 * ClosePositionPanel — the "Close %" flow for the order ticket.
 *
 * Closes a chosen fraction of an open position on the current symbol. Because
 * the platform allows hedging (multiple positions on one symbol at different
 * directions / leverage), this disambiguates *which* position via an in-panel
 * picker that is two-way bound to the chart selection — picking a row lights up
 * that trade's lines on the chart so the trader sees exactly what they'll cut.
 *
 * Routes to /trade/close with a `fraction` (0–1); 100% becomes a full close.
 */
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { workerPost } from "@/lib/workerApi";
import { syncTrade, syncAccount } from "@/lib/supabaseClient";
import { toast } from "sonner";

const PCT_PRESETS = [25, 50, 75, 100];

function fmtUsd(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`;
}

// Live P&L of a position at the current price (USD on notional).
function positionPnl(t, price) {
  if (!price || !t?.entry_price || !t?.size) return 0;
  const movePct = (price - t.entry_price) / t.entry_price;
  return (t.direction === "long" ? 1 : -1) * movePct * t.size;
}

export default function ClosePositionPanel({
  displaySymbol,
  currentPrice,
  account,
  apiSecret,
  openTrades = [],
  selectedPositionId,
  onSelectPosition,
  onClosed,
  onCancel,
}) {
  const positions = useMemo(
    () => openTrades.filter((t) => t.symbol === displaySymbol && t.status === "open"),
    [openTrades, displaySymbol]
  );

  // Default to the chart-selected position when it's on this symbol, else the
  // most recent. Kept in sync if the selection changes from outside.
  const selected =
    positions.find((t) => t.id === selectedPositionId) ?? positions[0] ?? null;

  const [pct, setPct] = useState(100);
  const [loading, setLoading] = useState(false);

  // If the picked position vanishes (SL/TP/market-close fired), fall back.
  useEffect(() => {
    if (positions.length && !positions.some((t) => t.id === selected?.id) && positions[0]) {
      onSelectPosition?.(positions[0].id);
    }
  }, [positions, selected?.id, onSelectPosition]);

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground text-center">
        No open {displaySymbol} position to close.
      </div>
    );
  }

  const pnlFull = positionPnl(selected, currentPrice);
  const realised = pnlFull * (pct / 100);
  const closedNotional = (selected?.size ?? 0) * (pct / 100);
  const remaining = (selected?.size ?? 0) - closedNotional;
  const lev = selected?.leverage || 1;

  const handleConfirm = async () => {
    if (!selected) return;
    if (!apiSecret) { toast.error("Account secret not ready — please try again"); return; }
    setLoading(true);
    try {
      const res = await workerPost("/trade/close", {
        trade_id: selected.id,
        account_id: account.id,
        api_secret: apiSecret,
        fraction: pct / 100,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Worker error ${res.status}`);

      const pnl = Number(data?.realised_pnl ?? data?.pnl ?? 0);
      // Nudge the local mirrors so the UI reflects the change before realtime.
      const newBalance   = (account.current_balance  ?? 0) + pnl;
      const newDailyLoss = (account.daily_loss_today ?? 0) + Math.min(0, pnl);
      syncAccount(account.id, { current_balance: newBalance, daily_loss_today: newDailyLoss });
      if (pct >= 100) {
        syncTrade(selected.id, { status: "closed", exit_price: data?.exit_price, pnl, close_time: new Date().toISOString() });
      } else if (typeof data?.size === "number") {
        syncTrade(selected.id, { size: data.size });
      }

      toast.success(
        pct >= 100 ? `Position closed · ${fmtUsd(pnl)}` : `Closed ${pct}% · ${fmtUsd(pnl)}`
      );
      onClosed?.();
    } catch (err) {
      toast.error("Close failed", { description: err?.message || "Could not close position." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Close Position</span>
        {onCancel && (
          <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>

      {/* Position picker — only when hedging (more than one on this symbol). */}
      {positions.length > 1 ? (
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Which {displaySymbol} position?</span>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {positions.map((t) => {
              const pnl = positionPnl(t, currentPrice);
              const active = t.id === selected?.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectPosition?.(t.id)}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`font-semibold ${t.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                      {t.direction === "long" ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-muted-foreground">{t.leverage || 1}×</span>
                    <span className="text-foreground">${Number(t.size).toLocaleString()}</span>
                  </span>
                  <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(pnl)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className={`font-semibold ${selected.direction === "long" ? "text-green-400" : "text-red-400"}`}>
              {selected.direction === "long" ? "LONG" : "SHORT"}
            </span>
            <span className="text-muted-foreground">{lev}×</span>
            <span className="text-foreground">${Number(selected.size).toLocaleString()}</span>
          </span>
          <span className={pnlFull >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(pnlFull)}</span>
        </div>
      )}

      {/* Amount to close */}
      <div className="grid grid-cols-4 gap-1">
        {PCT_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPct(p)}
            className={`py-1.5 rounded-md text-xs font-semibold transition-all ${
              pct === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}%
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        {pct >= 100 ? (
          <>Close the entire position → realise <span className={realised >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(realised)}</span>.</>
        ) : (
          <>Close {pct}% (${closedNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}) → realise{" "}
            <span className={realised >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(realised)}</span>;{" "}
            ${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} notional remains.</>
        )}
      </div>

      <Button
        className="w-full font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
        disabled={loading || !selected || !account}
        onClick={handleConfirm}
      >
        {loading ? "Closing…" : pct >= 100 ? "Close Position" : `Close ${pct}%`}
      </Button>
    </div>
  );
}
