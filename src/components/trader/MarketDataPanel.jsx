/**
 * MarketDataPanel — Funding rate and open interest info for the selected symbol.
 *
 * Order book and recent trades have been removed since this is a prop trading
 * evaluation platform — traders only need market context (funding/OI), not
 * exchange-side trade flow.
 */
import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { formatUtcTime } from "@/lib/datetime";

export default function MarketDataPanel({ symbol }) {
  const [fundingInfo, setFundingInfo] = useState(null);
  // Collapsed by default to save vertical space in the sidebar. Persisted
  // so a trader who opens it keeps it open across reloads.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("terminal.marketInfoOpen") === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("terminal.marketInfoOpen", open ? "1" : "0"); } catch {}
  }, [open]);

  // ── Funding / OI (Binance REST — best-effort, not critical) ─────
  // Only poll while the accordion is open — no point fetching data the
  // trader can't see.
  useEffect(() => {
    if (!open) return undefined;
    const fetchInfo = async () => {
      // Try Binance.com first, then Binance.US — OKX/Bybit have different APIs
      for (const host of ["https://fapi.binance.com", "https://fapi.binance.us"]) {
        try {
          const [pr, oi] = await Promise.all([
            fetch(`${host}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
            fetch(`${host}/fapi/v1/openInterest?symbol=${symbol}`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
          ]);
          if (pr?.symbol) { setFundingInfo({ ...pr, openInterest: parseFloat(oi.openInterest) }); return; }
        } catch { /* try next */ }
      }
      setFundingInfo(null);
    };
    fetchInfo();
    const id = setInterval(fetchInfo, 30000);
    return () => clearInterval(id);
  }, [symbol, open]);

  const base = symbol.replace("USDT", "");

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          Market Info
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          {fundingInfo ? (
            <div className="space-y-2">
              {[
                ["Mark Price",    `$${parseFloat(fundingInfo.markPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ["Index Price",   `$${parseFloat(fundingInfo.indexPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ["Funding Rate",  `${(parseFloat(fundingInfo.lastFundingRate) * 100).toFixed(4)}%`],
                ["Next Funding",  `${formatUtcTime(fundingInfo.nextFundingTime)} UTC`],
                ["Open Interest", fundingInfo.openInterest
                  ? `${fundingInfo.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${base}`
                  : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4 animate-pulse">
              Loading market info…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
