import { useState, useEffect, useRef } from "react";
import { fetchDailyOpens } from "@/lib/workerCandles";

/**
 * Live prices for every asset class, streamed from the worker.
 *
 * The worker holds one upstream connection per provider and re-broadcasts to
 * traders (see worker/priceStream.js), which buys two things the browser can't
 * get on its own:
 *
 *   - No geo-blocking. Only the worker's IP reaches an exchange, so a trader in
 *     a country that blocks Binance is served exactly like everyone else.
 *   - No display/execution drift. The price shown here is the same tick the
 *     worker fills against, rather than a second independently-sourced number.
 *
 * Endpoint: GET {VITE_WORKER_URL}/prices/stream?symbols=A,B,C
 * Frames:   { snapshot: { SYM: quote } }  once on connect
 *           { quotes:   { SYM: quote } }  thereafter, changed symbols only
 *
 * @param {string[]} symbols — e.g. ["BTCUSDT", "EUR/USD", "XAU/USD", "AAPL"]
 * @returns {{ tickers: Object, connected: boolean }}
 */

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export default function useWorkerPriceFeed(symbols) {
  const [tickers, setTickers] = useState({});
  const [connected, setConnected] = useState(false);

  // Session high/low per symbol. The worker streams a spot price only, so the
  // 24h extremes shown in the terminal are accumulated here and refined by
  // use24hStats where it has real history.
  const historyRef = useRef({});

  // UTC daily opens, fetched once per symbol set. Without these the dropdown's
  // % change reads 0 because open24h would just be the first price we saw.
  const dailyOpensRef = useRef({});

  const symbolsKey = [...symbols].sort().join(",");

  useEffect(() => {
    if (!symbolsKey) return;

    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) {
      console.error("VITE_WORKER_URL is not configured — live prices unavailable");
      return;
    }

    let destroyed = false;
    let es = null;
    let retryTimer = null;
    let backoff = BASE_BACKOFF_MS;

    // Fold incoming quotes into the ticker shape the terminal consumes.
    function applyQuotes(quotes) {
      setTickers((prev) => {
        const next = { ...prev };
        for (const [symbol, q] of Object.entries(quotes)) {
          const price = Number(q?.price);
          if (!Number.isFinite(price) || price <= 0) continue;

          const history = historyRef.current[symbol] || {};
          const ticker = {
            price,
            open24h: dailyOpensRef.current[symbol] ?? history.open24h ?? price,
            high24h: Math.max(history.high24h ?? price, price),
            low24h: Math.min(history.low24h ?? price, price),
            // Neither provider publishes volume; the terminal hides these.
            volume: 0,
            quoteVolume: 0,
          };
          historyRef.current[symbol] = ticker;
          next[symbol] = ticker;
        }
        return next;
      });
    }

    const open = () => {
      if (destroyed) return;

      const url = `${workerUrl}/prices/stream?symbols=${encodeURIComponent(symbolsKey)}`;
      es = new EventSource(url);

      es.onopen = () => {
        if (destroyed) return;
        setConnected(true);
      };

      es.onmessage = (event) => {
        if (destroyed) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        // The worker refuses new streams past its subscriber cap. Retrying
        // immediately would just spin, so let the backoff carry it.
        if (msg.error) {
          console.warn("Worker price stream refused:", msg.error);
          return;
        }

        // Only reset the retry curve once real data arrives — an open that
        // immediately fails shouldn't look like a healthy connection.
        backoff = BASE_BACKOFF_MS;
        if (msg.snapshot) applyQuotes(msg.snapshot);
        if (msg.quotes) applyQuotes(msg.quotes);
      };

      es.onerror = () => {
        if (destroyed) return;
        setConnected(false);
        es.close();
        es = null;

        const jittered = backoff * (0.5 + Math.random() * 0.5);
        retryTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          open();
        }, jittered);
      };
    };

    open();

    // Non-critical: a failed batch just leaves % change based on session open.
    fetchDailyOpens(symbolsKey.split(","))
      .then((opens) => { if (!destroyed) dailyOpensRef.current = opens; })
      .catch(() => {});

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      if (es) es.close();
      setConnected(false);
    };
  }, [symbolsKey]);

  return { tickers, connected };
}
