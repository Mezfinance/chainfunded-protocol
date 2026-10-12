import { useState, useEffect } from "react";
import { fetch24hStats } from "@/lib/workerCandles";

/**
 * use24hStats — rolling 24h open / high / low for a symbol.
 *
 * Neither Binance's bookTicker stream nor eToro's carries 24h statistics, so
 * the worker derives the window from the last 24 hourly candles. Refreshes
 * every 60s; callers should blend `high24h`/`low24h` with the current live
 * price for an up-to-the-tick extreme.
 *
 * Works for every asset class — the worker routes crypto to Binance and
 * everything else to eToro behind one endpoint.
 */
const REFRESH_MS = 60_000;

export function use24hStats(symbol) {
  const [stats, setStats] = useState(null); // { open24h, high24h, low24h }

  useEffect(() => {
    if (!symbol) { setStats(null); return undefined; }
    let cancelled = false;

    async function load() {
      try {
        const next = await fetch24hStats(symbol);
        if (!cancelled && next) setStats(next);
      } catch { /* keep last good values */ }
    }

    setStats(null);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol]);

  return stats;
}
