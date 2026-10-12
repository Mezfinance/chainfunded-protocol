/**
 * OrderPanel — Trade entry form for the trading terminal.
 *
 * Handles market/limit order placement, position sizing, stop-loss and
 * take-profit inputs. Constructs trade records via Base44 and syncs to
 * Supabase. Enforces client-side validation against challenge rules
 * (max position size, drawdown limits) before submission.
 */
import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { syncTrade } from "@/lib/supabaseClient";
import { workerPost } from "@/lib/workerApi";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CheckCircle2, Lock, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getAssetConfig, LEVERAGE_PRESETS, ASSET_CLASS, ASSET_CLASS_LABELS } from "@/lib/assetConfig";
import { isMarketOpen, getMarketStatus, formatTimeUntil } from "@/lib/marketHours";
import ClosePositionPanel from "./ClosePositionPanel";

function InfoTip({ text }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help inline-block ml-1" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-center">{text}</TooltipContent>
    </Tooltip>
  );
}

const ORDER_TYPES = ["Market", "Limit", "Stop-Limit", "Trailing"];

function NumInput({ value, onChange, placeholder, suffix, className = "" }) {
  return (
    <div className="relative">
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-secondary border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${className} ${suffix ? "pr-10" : ""}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export default function OrderPanel({ symbol, currentPrice, account, apiSecret, openTrades = [], pendingOrders = [], externalReserved = 0, onOrderPlaced, onSLTPChange, appliedSetup, selectedPositionId, onSelectPosition }) {
  const [side, setSide] = useState("long");
  const [orderType, setOrderType] = useState("Market");
  const [sizeUsd, setSizeUsd] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailingRate, setTrailingRate] = useState("");
  // SL/TP: separate state for price-mode and %-mode inputs
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [slPct, setSlPct] = useState("");
  const [tpPct, setTpPct] = useState("");
  const [slTpMode, setSlTpMode] = useState("price"); // "price" | "pct"
  const [leverage, setLeverage] = useState(10);
  const [showClose, setShowClose] = useState(false);
  const [loading, setLoading] = useState(false);
  const [placed, setPlaced] = useState(false);

  // Whether this order type queues as pending rather than opening immediately
  const isPendingOrder = orderType === "Limit" || orderType === "Stop-Limit";

  // Asset-specific config: leverage limits, asset class
  const assetConfig = useMemo(() => getAssetConfig(symbol), [symbol]);
  const maxLeverage = assetConfig.maxLeverage || 125;
  const assetClass = assetConfig.assetClass || ASSET_CLASS.CRYPTO;
  const levPresets = LEVERAGE_PRESETS[assetClass] || [1, 5, 10, 25, 50, 100];
  const marketOpen = isMarketOpen(assetClass);

  // Clamp leverage when asset changes
  useEffect(() => {
    setLeverage(prev => Math.min(prev, maxLeverage));
  }, [maxLeverage]);

  // Display entry price for summary (limit_price for pending orders, current price for market)
  const entryPrice = useMemo(() => {
    if (orderType === "Market" || orderType === "Trailing") return currentPrice;
    if (orderType === "Limit") return parseFloat(limitPrice) || currentPrice;
    if (orderType === "Stop-Limit") return parseFloat(limitPrice) || parseFloat(stopPrice) || currentPrice;
    return currentPrice;
  }, [orderType, currentPrice, limitPrice, stopPrice]);

  const balance = account?.current_balance ?? account?.account_size ?? 0;
  // Pending limit orders reserve margin too — otherwise a trader could queue
  // unlimited orders that all become valid once price reaches them.
  const marginOf = (t) => (t.size || 0) / (t.leverage || 1);
  const totalMarginUsed =
    openTrades.reduce((sum, t) => sum + marginOf(t), 0) +
    pendingOrders.reduce((sum, t) => sum + marginOf(t), 0);
  // externalReserved = capital committed to live zone-trade bets — it can't
  // be reused as trade margin (the worker enforces this; this keeps the UI honest).
  const availableBalance = balance - totalMarginUsed - (externalReserved || 0);
  const margin = parseFloat(sizeUsd) || 0;
  const notional = margin * leverage;
  const balanceAfter = availableBalance - margin;

  // Absolute SL/TP prices derived from whichever mode is active
  const slAbsPrice = useMemo(() => {
    if (slTpMode === "price") return parseFloat(sl) || null;
    const pct = parseFloat(slPct);
    if (!pct || !entryPrice) return null;
    return side === "long"
      ? entryPrice * (1 - pct / 100)
      : entryPrice * (1 + pct / 100);
  }, [slTpMode, sl, slPct, entryPrice, side]);

  const tpAbsPrice = useMemo(() => {
    if (slTpMode === "price") return parseFloat(tp) || null;
    const pct = parseFloat(tpPct);
    if (!pct || !entryPrice) return null;
    return side === "long"
      ? entryPrice * (1 + pct / 100)
      : entryPrice * (1 - pct / 100);
  }, [slTpMode, tp, tpPct, entryPrice, side]);

  // Hint values shown under inputs
  const slHintPct = slTpMode === "price" && slAbsPrice && entryPrice
    ? Math.abs((slAbsPrice - entryPrice) / entryPrice * 100) : null;
  const tpHintPct = slTpMode === "price" && tpAbsPrice && entryPrice
    ? Math.abs((tpAbsPrice - entryPrice) / entryPrice * 100) : null;

  const estLoss = slAbsPrice && entryPrice
    ? -(Math.abs((slAbsPrice - entryPrice) / entryPrice) * notional) : null;
  const estGain = tpAbsPrice && entryPrice
    ? (Math.abs((tpAbsPrice - entryPrice) / entryPrice) * notional) : null;
  const rr = estLoss && estGain
    ? (estGain / Math.abs(estLoss)).toFixed(2) : null;
  // Risk as a % of account balance, vs the challenge's daily-loss limit — the
  // number that actually matters on a prop account.
  const maxDailyLossPct = account?.max_daily_loss_pct || 5;
  const riskPctOfBalance = estLoss && balance > 0
    ? (Math.abs(estLoss) / balance) * 100 : null;
  const riskExceedsDaily = riskPctOfBalance != null && riskPctOfBalance > maxDailyLossPct;

  // Directional validation: warn if limit price would fill immediately
  const limitPriceFloat = parseFloat(limitPrice);
  const limitPriceWarning = useMemo(() => {
    if (!limitPriceFloat || !currentPrice) return null;
    if (orderType === "Limit" || orderType === "Stop-Limit") {
      if (side === "long" && limitPriceFloat > currentPrice)
        return "Limit price is above market — order will fill immediately at market price";
      if (side === "short" && limitPriceFloat < currentPrice)
        return "Limit price is below market — order will fill immediately at market price";
    }
    return null;
  }, [orderType, side, limitPriceFloat, currentPrice]);

  // Symbol sent to the worker for price lookup AND used to match open trades.
  // Crypto trades are historically stored slash-form ("BTC/USDT"), which the
  // worker normalises back to the feed key. Non-crypto assets must use the
  // canonical symbol ("WTI/USD", "AAPL", …) because their display_name
  // ("Crude Oil (WTI)", "Apple") is not a key the worker can resolve.
  const displaySymbol = assetClass === ASSET_CLASS.CRYPTO
    ? (assetConfig.display_name || symbol.replace("USDT", "/USDT"))
    : (assetConfig.symbol || symbol);
  // Open positions on the current symbol — drives the Close action's
  // availability (disabled when there's nothing to close).
  const symbolPositions = openTrades.filter(
    t => t.symbol === displaySymbol && t.status === "open"
  );

  // Push absolute SL/TP to chart price lines
  useEffect(() => {
    onSLTPChange?.(slAbsPrice, tpAbsPrice);
  }, [slAbsPrice, tpAbsPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a position plan drawn on the chart into the ticket (entry → limit
  // price, target → TP, stop → SL, direction → side). Re-applies whenever the
  // chart pushes a new setup (nonce changes).
  useEffect(() => {
    if (!appliedSetup) return;
    const fmt = (p) => {
      if (p == null) return "";
      const abs = Math.abs(p);
      const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
      return String(Number(p.toFixed(dp)));
    };
    if (appliedSetup.side) setSide(appliedSetup.side);
    setOrderType("Limit");
    setSlTpMode("price");
    setLimitPrice(fmt(appliedSetup.entry));
    setSl(fmt(appliedSetup.stop));
    setTp(fmt(appliedSetup.target));
  }, [appliedSetup?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const clampLev = v => Math.max(1, Math.min(maxLeverage, parseInt(v) || 1));

  const fmtHintPrice = (p) => {
    if (!p) return "";
    if (p >= 1000) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(5)}`;
  };

  const handleSubmit = async () => {
    if (!account || !sizeUsd) return;
    if (account.phase === "failed" || account.phase === "paid_out") {
      toast.error("Account is not active", {
        description: "This challenge account has been closed and cannot place new trades.",
      });
      return;
    }
    if (isPendingOrder && !limitPrice) {
      toast.error("Enter a limit price");
      return;
    }
    if (orderType === "Stop-Limit" && !stopPrice) {
      toast.error("Enter a stop price");
      return;
    }
    if (!isPendingOrder && !currentPrice) return;
    if (!marketOpen) {
      const status = getMarketStatus(assetClass);
      toast.error("Market closed", {
        description: `${ASSET_CLASS_LABELS[assetClass]} market is ${status.label}. ${status.nextChange ? `${status.nextChangeLabel} in ${formatTimeUntil(status.nextChange)}` : ""}`,
      });
      return;
    }
    if (margin > availableBalance) {
      toast.error("Insufficient margin", {
        description: `Available: $${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Required: $${margin.toFixed(2)}`,
      });
      return;
    }
    // Guard against SL/TP placed on the wrong side of entry — these would
    // trigger on the very next price tick, stopping the trader out before
    // the position has had any chance to move.
    if (entryPrice) {
      const isLong = side === "long";
      const fmtEntry = `$${entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      if (slAbsPrice != null) {
        const slOk = isLong ? slAbsPrice < entryPrice : slAbsPrice > entryPrice;
        if (!slOk) {
          toast.error("Stop Loss on wrong side of entry", {
            description: isLong
              ? `Long SL must be below entry (${fmtEntry})`
              : `Short SL must be above entry (${fmtEntry})`,
          });
          return;
        }
      }
      if (tpAbsPrice != null) {
        const tpOk = isLong ? tpAbsPrice > entryPrice : tpAbsPrice < entryPrice;
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
    setLoading(true);
    try {
      if (isPendingOrder) {
        // Limit and Stop-Limit orders queue as pending — created by the worker
        // so margin reservation + validation runs server-side and the client
        // can't tamper with status, entry_price, etc.
        if (!apiSecret) throw new Error("Account secret not ready — please try again");

        const res = await workerPost("/order/create", {
          account_id: account.id,
          api_secret: apiSecret,
          symbol: displaySymbol,
          direction: side,
          size: notional,
          leverage,
          order_type: orderType.toLowerCase().replace("-", "_"),
          limit_price: parseFloat(limitPrice),
          ...(orderType === "Stop-Limit" && { stop_price: parseFloat(stopPrice) }),
          ...(slAbsPrice && { sl: slAbsPrice }),
          ...(tpAbsPrice && { tp: tpAbsPrice }),
        });
        const newTrade = await res.json();
        if (!res.ok) throw new Error(newTrade?.error || `Worker error ${res.status}`);
        if (newTrade?.id) syncTrade(newTrade.id, newTrade);
        toast.success("Order queued", {
          description: `${displaySymbol} ${side === "long" ? "Long" : "Short"} limit @ $${parseFloat(limitPrice).toLocaleString()}`,
        });
      } else {
        // Market and Trailing orders — routed through the worker so entry price
        // always comes from the authoritative Pyth feed, not the client
        if (!apiSecret) throw new Error("Account secret not ready — please try again");

        const res = await workerPost("/trade/open", {
          account_id: account.id,
          api_secret: apiSecret,
          symbol: displaySymbol,
          direction: side,
          size: notional,
          leverage,
          order_type: orderType.toLowerCase().replace("-", "_"),
          ...(slAbsPrice && { sl: slAbsPrice }),
          ...(tpAbsPrice && { tp: tpAbsPrice }),
          ...(orderType === "Trailing" && trailingRate && { trailing_rate: parseFloat(trailingRate) }),
        });
        const newTrade = await res.json();
        if (!res.ok) throw new Error(newTrade?.error || `Worker error ${res.status}`);
        if (newTrade?.id) syncTrade(newTrade.id, newTrade);
      }
      setPlaced(true);
      setTimeout(() => setPlaced(false), 2500);
      setSizeUsd(""); setSl(""); setTp(""); setSlPct(""); setTpPct("");
      setLimitPrice(""); setStopPrice(""); setTrailingRate("");
      onOrderPlaced?.();
    } catch (err) {
      toast.error("Order failed", {
        description: err?.message || "Could not place order. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const base = assetConfig.base || symbol.replace("USDT", "").replace("/USD", "").replace("/", "");

  // Submit button label
  const submitLabel = () => {
    if (!marketOpen) return <><Lock className="w-4 h-4 mr-1" /> Market Closed</>;
    if (placed) return <><CheckCircle2 className="w-4 h-4 mr-1" /> {isPendingOrder ? "Order Queued!" : "Order Placed!"}</>;
    if (loading) return isPendingOrder ? "Queuing…" : "Placing…";
    if (isPendingOrder) return `Place Limit Order`;
    if (orderType === "Trailing") return `Place Trailing Order`;
    return `${side === "long" ? "Buy / Long" : "Sell / Short"} ${base}`;
  };

  const accountActive = account && account.phase !== "failed" && account.phase !== "paid_out";
  const submitDisabled = !marketOpen || !sizeUsd || loading || !accountActive
    || (isPendingOrder ? !limitPrice : !currentPrice)
    || margin > availableBalance;

  return (
    <div className="space-y-3 text-sm">
      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-1">
        {[
          { v: "long",  label: "↑ Long / Buy",   active: "bg-green-500 text-white shadow-lg shadow-green-500/20" },
          { v: "short", label: "↓ Short / Sell",  active: "bg-red-500 text-white shadow-lg shadow-red-500/20" },
        ].map(({ v, label, active }) => (
          <button
            key={v}
            onClick={() => setSide(v)}
            className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${side === v ? active : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Order Type */}
      <div className="flex gap-0.5 bg-secondary rounded-lg p-1">
        {ORDER_TYPES.map(t => {
          const tips = {
            "Market": "Execute immediately at current market price",
            "Limit": "Queue order — executes automatically when price reaches your level",
            "Stop-Limit": "Triggers a limit order when stop price is hit",
            "Trailing": "Follows price movement, enters on a percentage pullback",
          };
          return (
            <Tooltip key={t}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setOrderType(t)}
                  className={`flex-1 min-w-0 whitespace-nowrap py-1 text-[11px] rounded-md font-medium transition-all ${orderType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px] text-center">{tips[t]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Leverage */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground">Leverage<InfoTip text="Multiplier applied to your margin. Higher leverage amplifies both gains and losses." /></label>
          <span className="text-xs font-bold text-foreground tabular-nums">{leverage}×</span>
        </div>
        {/* Quick presets */}
        <div className="flex gap-1 mb-2">
          {levPresets.filter(l => l <= maxLeverage).map(l => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className={`flex-1 py-0.5 text-xs rounded font-semibold border transition-all ${leverage === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
            >
              {l}×
            </button>
          ))}
        </div>
        {/* Slider + numeric input */}
        <div className="flex items-center gap-2">
          <Slider
            value={[leverage]}
            onValueChange={([v]) => setLeverage(v)}
            min={1}
            max={maxLeverage}
            step={1}
            className="flex-1"
          />
          <input
            type="number"
            value={leverage}
            min={1}
            max={maxLeverage}
            onChange={e => setLeverage(clampLev(e.target.value))}
            className="w-14 bg-secondary border border-border rounded px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {assetClass !== ASSET_CLASS.CRYPTO && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {ASSET_CLASS_LABELS[assetClass]} · Max {maxLeverage}×
          </p>
        )}
      </div>

      {/* Type-specific price inputs */}
      {orderType === "Limit" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Limit Price (USDT)</label>
          <NumInput value={limitPrice} onChange={setLimitPrice} placeholder={currentPrice?.toFixed(2)} className="border-border focus:ring-primary" />
          {limitPriceWarning && (
            <p className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />{limitPriceWarning}
            </p>
          )}
        </div>
      )}
      {orderType === "Stop-Limit" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Stop Price (USDT)<InfoTip text="When market reaches this price, a limit order is placed at your limit price." /></label>
            <NumInput value={stopPrice} onChange={setStopPrice} placeholder={currentPrice?.toFixed(2)} className="border-border focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Limit Price (USDT)<InfoTip text="The price at which your order will be filled after the stop triggers." /></label>
            <NumInput value={limitPrice} onChange={setLimitPrice} placeholder={currentPrice?.toFixed(2)} className="border-border focus:ring-primary" />
            {limitPriceWarning && (
              <p className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />{limitPriceWarning}
              </p>
            )}
          </div>
        </>
      )}
      {orderType === "Trailing" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Callback Rate</label>
          <NumInput value={trailingRate} onChange={setTrailingRate} placeholder="1.0" suffix="%" className="border-border focus:ring-primary" />
          <p className="text-xs text-muted-foreground mt-1">
            Enters at market · trails {trailingRate || "—"}% behind the price peak
          </p>
        </div>
      )}

      {/* Margin size */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Margin (USDT)<InfoTip text="Collateral locked for this position. This is the maximum you can lose if liquidated." /></label>
        <NumInput value={sizeUsd} onChange={setSizeUsd} placeholder="0.00" suffix="USDT" className="border-border focus:ring-primary" />
        {account && (
          <div className="flex gap-1 mt-1.5">
            {[10, 25, 50, 100].map(pct => (
              <button
                key={pct}
                onClick={() => setSizeUsd(((availableBalance * pct) / 100).toFixed(0))}
                className="flex-1 text-xs py-0.5 bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SL / TP */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">Stop Loss / Take Profit<InfoTip text="SL auto-closes to limit downside. TP auto-closes to lock in profit." /></span>
          {/* Price / % toggle */}
          <div className="flex rounded-md overflow-hidden border border-border">
            {[["$", "price"], ["%", "pct"]].map(([label, mode]) => (
              <button
                key={mode}
                onClick={() => setSlTpMode(mode)}
                className={`px-2.5 py-0.5 text-xs font-semibold transition-colors ${slTpMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Stop Loss */}
          <div>
            <label className="text-xs text-red-400 mb-1 block">Stop Loss</label>
            {slTpMode === "price" ? (
              <NumInput value={sl} onChange={setSl} placeholder="—" className="border-red-500/20 focus:ring-red-500" />
            ) : (
              <NumInput value={slPct} onChange={setSlPct} placeholder="2.0" suffix="%" className="border-red-500/20 focus:ring-red-500" />
            )}
            {estLoss !== null && (
              <p className="text-xs text-red-400 mt-0.5">
                ≈ -${Math.abs(estLoss).toFixed(2)}
                {riskPctOfBalance !== null && (
                  <span className={riskExceedsDaily ? "text-red-400 font-semibold" : "text-muted-foreground"}>
                    {" "}({riskPctOfBalance.toFixed(2)}% of bal)
                  </span>
                )}
              </p>
            )}
            {riskExceedsDaily && (
              <p className="text-[10px] text-red-400 mt-0.5 leading-tight">
                Exceeds {maxDailyLossPct}% daily-loss limit
              </p>
            )}
            {slTpMode === "price" && slHintPct !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">{slHintPct.toFixed(2)}% from entry</p>
            )}
            {slTpMode === "pct" && slAbsPrice && (
              <p className="text-xs text-muted-foreground mt-0.5">→ {fmtHintPrice(slAbsPrice)}</p>
            )}
          </div>
          {/* Take Profit */}
          <div>
            <label className="text-xs text-green-400 mb-1 block">Take Profit</label>
            {slTpMode === "price" ? (
              <NumInput value={tp} onChange={setTp} placeholder="—" className="border-green-500/20 focus:ring-green-500" />
            ) : (
              <NumInput value={tpPct} onChange={setTpPct} placeholder="4.0" suffix="%" className="border-green-500/20 focus:ring-green-500" />
            )}
            {estGain !== null && (
              <p className="text-xs text-green-400 mt-0.5">≈ +${estGain.toFixed(2)}</p>
            )}
            {slTpMode === "price" && tpHintPct !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">{tpHintPct.toFixed(2)}% from entry</p>
            )}
            {slTpMode === "pct" && tpAbsPrice && (
              <p className="text-xs text-muted-foreground mt-0.5">→ {fmtHintPrice(tpAbsPrice)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      {margin > 0 && (
        <div className="bg-secondary/60 rounded-lg p-3 space-y-1.5">
          {[
            ["Order Type", orderType, null],
            ["Entry Price", isPendingOrder
              ? (limitPriceFloat ? `$${limitPriceFloat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—")
              : (entryPrice ? `$${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"),
              isPendingOrder ? "Price at which your limit order will execute" : "Price at which your position will be opened"],
            ["Position Size", `$${notional.toLocaleString()}`, "Total position value (margin × leverage)"],
            ["Margin Required", `$${margin.toLocaleString()}`, "Collateral locked for this trade"],
            ...(rr ? [["Risk / Reward", `1 : ${rr}`, "Ratio of potential loss (SL) to potential gain (TP)"]] : []),
          ].map(([k, v, tip]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{k}{tip && <InfoTip text={tip} />}</span>
              <span className="text-foreground font-medium">{v}</span>
            </div>
          ))}
          {account && (
            <>
              <div className="border-t border-border/50 my-1" />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Available</span>
                <span className="text-foreground font-medium">
                  ${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">After Order</span>
                <span className={`font-semibold ${balanceAfter < 0 ? "text-red-400" : balanceAfter < balance * 0.1 ? "text-yellow-400" : "text-green-400"}`}>
                  ${balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {isPendingOrder && (
        <p className="text-xs text-muted-foreground text-center">
          Order executes automatically when price is reached — even if you're offline
        </p>
      )}

      {/* Close flow — expands above the action row when toggled */}
      {showClose && (
        <ClosePositionPanel
          displaySymbol={displaySymbol}
          currentPrice={currentPrice}
          account={account}
          apiSecret={apiSecret}
          openTrades={openTrades}
          selectedPositionId={selectedPositionId}
          onSelectPosition={onSelectPosition}
          onClosed={() => { setShowClose(false); onOrderPlaced?.(); }}
          onCancel={() => setShowClose(false)}
        />
      )}

      {/* Open / Close actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          className={`font-semibold text-white transition-all ${
            !marketOpen ? "bg-zinc-600 cursor-not-allowed"
            : placed ? "bg-primary"
            : isPendingOrder ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
            : side === "long" ? "bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/20"
            : "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
          }`}
          disabled={submitDisabled}
          onClick={handleSubmit}
        >
          {submitLabel()}
        </Button>
        <Button
          variant="outline"
          className={`font-semibold transition-all ${showClose ? "border-primary text-primary" : "border-border text-foreground hover:bg-secondary"}`}
          disabled={symbolPositions.length === 0 || !accountActive}
          onClick={() => setShowClose(o => !o)}
          title={symbolPositions.length === 0 ? `No open ${displaySymbol} position` : "Close part or all of a position"}
        >
          {showClose ? "Hide Close" : `Close${symbolPositions.length > 1 ? ` (${symbolPositions.length})` : ""}`}
        </Button>
      </div>

      {!account && (
        <p className="text-xs text-muted-foreground text-center">Select a challenge account to trade</p>
      )}
    </div>
  );
}
