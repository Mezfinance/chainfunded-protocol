/**
 * TerminalBottomPanel — the resizable panel beneath the chart that hosts
 * Open Positions, Open Orders, and Trade History tabs. Standard layout for
 * pro trading terminals (Binance / Bybit / Hyperliquid / MEXC).
 *
 * Props:
 *   account, apiSecret, currentSymbol   — passed through to children
 *   openTrades, pendingOrders           — used for tab-strip counts
 *   onPositionClosed, onOrderCancelled  — child callbacks
 *   tabsToShow                          — array of tab ids to render
 *                                          (e.g. ["positions","orders"] on mobile)
 *   defaultTab                          — initial active tab id
 */
import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import ActivePositions from "./ActivePositions";
import PendingOrders   from "./PendingOrders";
import TradeHistory    from "./TradeHistory";
import LightningMark   from "@/components/brand/LightningMark";

const STORAGE_KEY_TAB    = "terminal.activeTab";
const STORAGE_KEY_FILTER = "terminal.hideOtherPairs";

const TAB_DEFS = {
  positions: { label: "Open Positions", short: "Positions" },
  orders:    { label: "Open Orders",    short: "Orders"    },
  history:   { label: "Trade History",  short: "History"   },
};

export default function TerminalBottomPanel({
  account,
  apiSecret,
  currentSymbol,
  openTrades = [],
  pendingOrders = [],
  refreshKey,
  selectedPositionId,
  onSelectPosition,
  onPositionClosed,
  onOrderCancelled,
  tabsToShow = ["positions", "orders", "history"],
  defaultTab = "positions",
}) {
  // Persist the active tab + filter across page loads.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TAB);
      return saved && tabsToShow.includes(saved) ? saved : defaultTab;
    } catch { return defaultTab; }
  });
  const [hideOtherPairs, setHideOtherPairs] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_FILTER) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_TAB, activeTab); } catch {}
  }, [activeTab]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_FILTER, hideOtherPairs ? "1" : "0"); } catch {}
  }, [hideOtherPairs]);

  // If the parent prunes a tab (e.g. mobile drops history) and that tab is
  // currently active, fall back to the default.
  useEffect(() => {
    if (!tabsToShow.includes(activeTab)) setActiveTab(defaultTab);
  }, [tabsToShow, activeTab, defaultTab]);

  // Tab-strip counts. Positions / orders pulled from the parent state so we
  // don't fire extra queries here.
  const positionsCount = useMemo(() => {
    const list = (openTrades || []).filter(t => !account?.id || t.account_id === account.id);
    return hideOtherPairs && currentSymbol
      ? list.filter(t => t.symbol === currentSymbol).length
      : list.length;
  }, [openTrades, account?.id, hideOtherPairs, currentSymbol]);

  const ordersCount = useMemo(() => {
    const list = (pendingOrders || []).filter(o => !account?.id || o.account_id === account.id);
    return hideOtherPairs && currentSymbol
      ? list.filter(o => o.symbol === currentSymbol).length
      : list.length;
  }, [pendingOrders, account?.id, hideOtherPairs, currentSymbol]);

  // Trade history is fetched here so the panel can show it without depending
  // on the parent.
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!account?.id) { setHistory([]); return; }
      try {
        const closed = await base44.entities.Trade.filter({
          account_id: account.id,
          status: "closed",
        });
        if (!cancelled) setHistory(Array.isArray(closed) ? closed : []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [account?.id, refreshKey]);

  const filteredHistory = useMemo(() => {
    if (!hideOtherPairs || !currentSymbol) return history;
    return history.filter(t => t.symbol === currentSymbol);
  }, [history, hideOtherPairs, currentSymbol]);

  const tabCount = (id) => {
    if (id === "positions") return positionsCount;
    if (id === "orders")    return ordersCount;
    if (id === "history")   return filteredHistory.length;
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-card border-t border-border overflow-hidden">
      {/* Tab strip */}
      <div className="flex items-center border-b border-border bg-card/80 px-2 shrink-0">
        <nav className="flex items-stretch">
          {tabsToShow.map((id) => {
            const isActive = activeTab === id;
            const count = tabCount(id);
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="lg:hidden">{TAB_DEFS[id]?.short || id}</span>
                <span className="hidden lg:inline">{TAB_DEFS[id]?.label || id}</span>
                {count != null && (
                  <span className={`ml-1.5 ${isActive ? "text-primary" : "text-muted-foreground/70"}`}>
                    ({count})
                  </span>
                )}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                )}
              </button>
            );
          })}
        </nav>

        {tabsToShow.length > 1 && (
          <label className="ml-auto hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-3 py-1.5 hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={hideOtherPairs}
              onChange={(e) => setHideOtherPairs(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            Hide Other Pairs
          </label>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "positions" && (
          <ActivePositions
            account={account}
            apiSecret={apiSecret}
            refreshKey={refreshKey}
            onPositionClosed={onPositionClosed}
            currentSymbol={currentSymbol}
            hideOtherPairs={hideOtherPairs}
            selectedId={selectedPositionId}
            onSelect={onSelectPosition}
          />
        )}
        {activeTab === "orders" && (
          <PendingOrders
            account={account}
            apiSecret={apiSecret}
            refreshKey={refreshKey}
            onCancelled={onOrderCancelled}
            currentSymbol={currentSymbol}
            hideOtherPairs={hideOtherPairs}
          />
        )}
        {activeTab === "history" && (
          filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <LightningMark className="w-7 h-7 opacity-10" color="currentColor" />
              <p className="text-xs text-muted-foreground">
                {hideOtherPairs && currentSymbol
                  ? `No trade history for ${currentSymbol}`
                  : "No closed trades yet — performance settles on-chain at payout."}
              </p>
            </div>
          ) : (
            <TradeHistory trades={filteredHistory} />
          )
        )}
      </div>
    </div>
  );
}
