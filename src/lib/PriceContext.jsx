/**
 * PriceContext — Real-time price feed provider.
 *
 * The worker is the single live-price source for ALL asset classes. It holds
 * one upstream connection per provider and streams to every trader, so the
 * browser never talks to an exchange and the price shown is the same tick the
 * worker fills against. See docs/price-feeds.md.
 *
 * Provides `usePrices()` hook returning a price map keyed by symbol.
 *
 * Exports:
 *   - PriceProvider: context provider component
 *   - usePrices(): hook returning { tickers, connected, getPrice, getTicker }
 */
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import useWorkerPriceFeed from "@/hooks/useWorkerPriceFeed";
import { MOCK_PRICES } from "@/lib/screenshotMocks";

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

/**
 * Components register the symbols they need; the context subscribes them all
 * to the worker's price stream.
 *
 * Usage:
 *   useRegisterSymbols(["BTCUSDT", "EUR/USD", "AAPL"]);
 *   const { getPrice, getTicker, connected } = usePrices();
 */

const PriceContext = createContext({
  tickers: {},
  connected: false,
  getPrice: () => null,
  getTicker: () => null,
  registerSymbols: () => {},
});

const MOCK_PRICE_VALUE = {
  tickers: MOCK_PRICES,
  connected: true,
  getPrice:    (symbol) => (symbol ? MOCK_PRICES[symbol]?.price ?? null : null),
  getTicker:   (symbol) => (symbol ? MOCK_PRICES[symbol] ?? null   : null),
  registerSymbols: () => {},
};

function MockPriceProvider({ children }) {
  return <PriceContext.Provider value={MOCK_PRICE_VALUE}>{children}</PriceContext.Provider>;
}

function RealPriceProvider({ children }) {
  const [symbols, setSymbols] = useState([]);

  const registerSymbols = useCallback((syms) => {
    const clean = syms.filter(Boolean).map((s) => s.toUpperCase());
    if (clean.length === 0) return;
    setSymbols((prev) => {
      const next = [...new Set([...prev, ...clean])];
      if (next.length === prev.length) return prev;
      return next;
    });
  }, []);

  // Every asset class streams from the worker — one source, no per-provider
  // routing. There is deliberately no browser-side fallback: trades are opened
  // and closed through the worker too, so a worker outage stops trading
  // regardless, and showing prices from a different source than the one that
  // settles fills is worse than showing none.
  const { tickers, connected } = useWorkerPriceFeed(symbols);

  // Keep a ref so getPrice/getTicker have stable identities.
  // Without this, every SSE price tick creates new function references,
  // causing cascading effect re-fires across the entire app.
  const tickersRef = useRef(tickers);
  tickersRef.current = tickers;

  const getPrice = useCallback(
    (symbol) => (symbol ? tickersRef.current[symbol]?.price ?? null : null),
    [],
  );
  const getTicker = useCallback(
    (symbol) => (symbol ? tickersRef.current[symbol] ?? null : null),
    [],
  );

  const value = useMemo(
    () => ({
      tickers,
      connected,
      getPrice,
      getTicker,
      registerSymbols,
    }),
    [tickers, connected, getPrice, getTicker, registerSymbols]
  );

  return (
    <PriceContext.Provider value={value}>{children}</PriceContext.Provider>
  );
}

export const PriceProvider = IS_SCREENSHOTS ? MockPriceProvider : RealPriceProvider;

export const usePrices = () => useContext(PriceContext);

/**
 * Helper hook — registers symbols with the global price feed.
 * Automatically routes each symbol to the correct provider.
 */
export function useRegisterSymbols(symbols) {
  const { registerSymbols } = usePrices();
  const key = (symbols ?? []).filter(Boolean).join(",");
  useEffect(() => {
    if (!key) return;
    registerSymbols(key.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
