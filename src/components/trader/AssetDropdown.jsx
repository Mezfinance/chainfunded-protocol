import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Search, Clock, Circle } from "lucide-react";
import {
  ASSET_CLASS,
  ASSET_CLASS_LABELS,
  getAssetConfig,
} from "@/lib/assetConfig";
import { getMarketStatus, formatTimeUntil } from "@/lib/marketHours";
import { usePrices, useRegisterSymbols } from "@/lib/PriceContext";

const CLASS_COLORS = {
  [ASSET_CLASS.CRYPTO]: "text-orange-400 bg-orange-500/10",
  [ASSET_CLASS.FX]: "text-blue-400 bg-blue-500/10",
  [ASSET_CLASS.COMMODITIES]: "text-yellow-400 bg-yellow-500/10",
  [ASSET_CLASS.STOCKS]: "text-green-400 bg-green-500/10",
};

/**
 * Categorized asset selector dropdown with market status indicators.
 *
 * Props:
 *   pairs     — [{ symbol, display_name, asset_class }]
 *   symbol    — currently selected symbol
 *   onSelect  — (symbol) => void
 */
function formatMiniPrice(p) {
  if (!p) return null;
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

export default function AssetDropdown({ pairs, symbol, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeClass, setActiveClass] = useState("all");
  const [marketStatuses, setMarketStatuses] = useState({});
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);
  const { getPrice, getTicker } = usePrices();

  // Register all dropdown symbols so live prices are available for all of them
  const allSymbols = useMemo(() => pairs.map(p => p.symbol), [pairs]);
  useRegisterSymbols(allSymbols);

  // Update market statuses every 30s
  useEffect(() => {
    function updateStatuses() {
      const statuses = {};
      for (const cls of Object.values(ASSET_CLASS)) {
        statuses[cls] = getMarketStatus(cls);
      }
      setMarketStatuses(statuses);
    }
    updateStatuses();
    const interval = setInterval(updateStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when opened — desktop only. Auto-focusing on touch devices
  // pops the keyboard and triggers an iOS viewport zoom, which is jarring.
  useEffect(() => {
    if (!open) return;
    const isPointerFine =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)").matches;
    if (isPointerFine) searchRef.current?.focus();
  }, [open]);

  // Group pairs by asset class — derive from local config, not DB field
  const grouped = useMemo(() => {
    const groups = {};
    for (const cls of Object.values(ASSET_CLASS)) {
      groups[cls] = [];
    }
    for (const p of pairs) {
      const config = getAssetConfig(p.symbol);
      const cls = config.assetClass || ASSET_CLASS.CRYPTO;
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(p);
    }
    return groups;
  }, [pairs]);

  // Filter by search + active class
  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const result = {};
    for (const [cls, items] of Object.entries(grouped)) {
      if (activeClass !== "all" && cls !== activeClass) continue;
      const filtered = q
        ? items.filter(p =>
            p.symbol.toLowerCase().includes(q) ||
            p.display_name.toLowerCase().includes(q)
          )
        : items;
      if (filtered.length > 0) result[cls] = filtered;
    }
    return result;
  }, [grouped, search, activeClass]);

  const currentPair = pairs.find(p => p.symbol === symbol);
  const currentClass = currentPair ? getAssetConfig(currentPair.symbol).assetClass : ASSET_CLASS.CRYPTO;
  const currentStatus = marketStatuses[currentClass];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-secondary hover:bg-muted border border-border px-3 py-1.5 rounded-lg text-sm font-semibold text-foreground transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${currentStatus?.isOpen ? "bg-green-400" : "bg-red-400"}`} />
        {currentPair?.display_name || symbol}
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-2xl z-50 w-96 max-h-[480px] flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search assets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-[16px] sm:text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Asset class tabs */}
          <div className="flex gap-0.5 p-1.5 border-b border-border bg-secondary/30 overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveClass("all")}
              className={`px-2.5 py-1 text-[10px] rounded font-semibold whitespace-nowrap transition-colors ${
                activeClass === "all"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {Object.entries(ASSET_CLASS_LABELS).map(([key, label]) => {
              const status = marketStatuses[key];
              return (
                <button
                  key={key}
                  onClick={() => setActiveClass(key)}
                  className={`px-2.5 py-1 text-[10px] rounded font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
                    activeClass === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {status && (
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${status.isOpen ? "bg-green-400" : "bg-red-400"}`} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1">
            {Object.entries(filteredGroups).map(([cls, items]) => {
              const status = marketStatuses[cls];
              return (
                <div key={cls}>
                  {/* Class header */}
                  <div className="sticky top-0 bg-card/95 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${CLASS_COLORS[cls]?.split(" ")[0] || "text-muted-foreground"}`}>
                        {ASSET_CLASS_LABELS[cls]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">({items.length})</span>
                    </div>
                    {status && (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${status.isOpen ? "bg-green-400" : "bg-red-400"}`} />
                        <span className={status.isOpen ? "text-green-400" : "text-red-400"}>
                          {status.label}
                        </span>
                        {status.nextChange && (
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {status.nextChangeLabel} in {formatTimeUntil(status.nextChange)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Assets */}
                  {items.map(p => {
                    const config = getAssetConfig(p.symbol);
                    const isSelected = p.symbol === symbol;
                    const isClosed = status && !status.isOpen;
                    const ticker = getTicker(p.symbol);
                    const livePrice = ticker?.price ?? null;
                    const dailyPct = livePrice && ticker?.open24h
                      ? ((livePrice - ticker.open24h) / ticker.open24h) * 100
                      : null;
                    const isPositive = dailyPct !== null && dailyPct >= 0;
                    return (
                      <button
                        key={p.symbol}
                        onClick={() => {
                          onSelect(p.symbol);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group ${
                          isSelected
                            ? "text-primary font-semibold bg-primary/5"
                            : "text-foreground hover:bg-secondary"
                        } ${isClosed ? "opacity-70" : ""}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{p.display_name}</span>
                          {isClosed && (
                            <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">
                              CLOSED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {livePrice ? (
                            <span className={`text-xs font-mono ${isClosed ? "text-muted-foreground" : isPositive ? "text-green-500" : "text-red-500"}`}>
                              {formatMiniPrice(livePrice)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                          {dailyPct !== null ? (
                            <span className={`text-[10px] font-mono min-w-[3.2rem] text-right ${isPositive ? "text-green-500" : "text-red-500"}`}>
                              {isPositive ? "+" : ""}{dailyPct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground min-w-[3.2rem] text-right">—</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {config.maxLeverage}×
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {Object.keys(filteredGroups).length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No assets match "{search}"
              </div>
            )}
          </div>

          {/* Market hours footer */}
          <div className="border-t border-border px-3 py-2 bg-secondary/30">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(marketStatuses).map(([cls, status]) => (
                <div key={cls} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${status.isOpen ? "bg-green-400" : "bg-red-400"}`} />
                  <span>{ASSET_CLASS_LABELS[cls]}</span>
                  {status.description && (
                    <span className="hidden sm:inline">· {status.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
