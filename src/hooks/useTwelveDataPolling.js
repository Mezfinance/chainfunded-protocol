import { useState, useEffect, useRef } from "react";

/**
 * Polling-based price feed for non-crypto assets (FX, Commodities, Stocks).
 *
 * Uses the TwelveData REST API (free tier: 8 calls/minute, 800/day).
 * Polls every 15 seconds for the latest price quote.
 *
 * When no API key is configured, falls back to simulated price movement
 * seeded from realistic baseline prices. This ensures the trading UI
 * works out-of-the-box for demo/paper-trading without requiring API keys.
 *
 * Set VITE_TWELVEDATA_API_KEY in your .env to enable real data.
 *
 * @param {string[]} symbols — e.g. ["EUR/USD", "AAPL", "XAU/USD"]
 * @returns {{ tickers: Object, connected: boolean }}
 */

const API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY || "";
const POLL_INTERVAL = 15000; // 15s

// Realistic baseline prices for simulation fallback
const BASELINE_PRICES = {
  // FX
  "EUR/USD": 1.0850, "USD/JPY": 149.50, "GBP/USD": 1.2650, "USD/CHF": 0.8780,
  "AUD/USD": 0.6520, "USD/CAD": 1.3580, "NZD/USD": 0.6080, "EUR/GBP": 0.8575,
  "EUR/JPY": 162.20, "GBP/JPY": 189.10, "EUR/CHF": 0.9530, "AUD/JPY": 97.50,
  "EUR/AUD": 1.6640, "GBP/CHF": 1.1110, "USD/SGD": 1.3420, "EUR/CAD": 1.4740,
  "AUD/NZD": 1.0720, "GBP/AUD": 1.9400, "USD/HKD": 7.8100, "USD/MXN": 17.15,
  // Commodities
  "XAU/USD": 2350.00, "XAG/USD": 28.50, "XPT/USD": 985.00, "XPD/USD": 1050.00,
  "XCU/USD": 4.25, "ALI/USD": 2450.00, "WTI/USD": 78.50, "BRN/USD": 82.30,
  "NG/USD": 2.15, "HO/USD": 2.65, "RB/USD": 2.45,
  "CORN/USD": 4.85, "SOYBEAN/USD": 12.30, "WHEAT/USD": 6.20, "COFFEE/USD": 1.95,
  "SUGAR/USD": 0.22, "COTTON/USD": 0.82, "COCOA/USD": 8500.00,
  "LHOG/USD": 0.78, "LCATTLE/USD": 1.85,
  // Stocks
  "AAPL": 195.00, "MSFT": 420.00, "NVDA": 875.00, "AMZN": 185.00,
  "GOOGL": 155.00, "META": 510.00, "TSLA": 245.00, "AVGO": 1350.00,
  "JPM": 198.00, "V": 285.00, "MA": 465.00, "BAC": 38.50,
  "UNH": 520.00, "JNJ": 155.00, "WMT": 172.00, "PG": 168.00,
  "HD": 365.00, "COST": 735.00, "XOM": 112.00, "MSTR": 1680.00,
};

function simulateTicker(symbol, prevPrice) {
  const base = BASELINE_PRICES[symbol] || 100;
  const current = prevPrice || base;
  // Random walk: ±0.02% per tick for FX, ±0.1% for stocks/commodities
  const isFx = symbol.includes("/") && !["XAU", "XAG", "XPT", "XPD", "XCU", "ALI", "WTI", "BRN", "NG", "HO", "RB", "CORN", "SOYBEAN", "WHEAT", "COFFEE", "SUGAR", "COTTON", "COCOA", "LHOG", "LCATTLE"].some(c => symbol.startsWith(c));
  const volatility = isFx ? 0.0002 : 0.001;
  const change = current * volatility * (Math.random() * 2 - 1);
  const newPrice = Math.max(current * 0.9, Math.min(current * 1.1, current + change));

  return {
    price: newPrice,
    open24h: base,
    high24h: Math.max(base * 1.005, newPrice),
    low24h: Math.min(base * 0.995, newPrice),
    volume: Math.floor(Math.random() * 10000000),
    quoteVolume: Math.floor(Math.random() * 500000000),
  };
}

export default function useTwelveDataPolling(symbols) {
  const [tickers, setTickers] = useState({});
  const [connected, setConnected] = useState(false);
  const prevPricesRef = useRef({});

  const symbolsKey = [...symbols].sort().join(",");

  useEffect(() => {
    if (symbols.length === 0) return;

    let destroyed = false;
    let timer;

    async function poll() {
      if (destroyed) return;

      if (API_KEY) {
        // Real TwelveData API
        try {
          const batch = symbols.join(",");
          const res = await fetch(
            `https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch)}&apikey=${API_KEY}`
          );
          if (res.ok) {
            const data = await res.json();
            const updates = {};
            // Single symbol returns { price: "..." }, multiple returns { SYM: { price: "..." } }
            if (symbols.length === 1) {
              const sym = symbols[0];
              const price = parseFloat(data.price);
              if (!isNaN(price)) {
                const prev = prevPricesRef.current[sym];
                updates[sym] = {
                  price,
                  open24h: prev?.open24h ?? price,
                  high24h: Math.max(prev?.high24h ?? price, price),
                  low24h: Math.min(prev?.low24h ?? price, price),
                  volume: prev?.volume ?? 0,
                  quoteVolume: prev?.quoteVolume ?? 0,
                };
              }
            } else {
              for (const sym of symbols) {
                const entry = data[sym];
                if (entry?.price) {
                  const price = parseFloat(entry.price);
                  if (!isNaN(price)) {
                    const prev = prevPricesRef.current[sym];
                    updates[sym] = {
                      price,
                      open24h: prev?.open24h ?? price,
                      high24h: Math.max(prev?.high24h ?? price, price),
                      low24h: Math.min(prev?.low24h ?? price, price),
                      volume: prev?.volume ?? 0,
                      quoteVolume: prev?.quoteVolume ?? 0,
                    };
                  }
                }
              }
            }
            if (Object.keys(updates).length > 0) {
              prevPricesRef.current = { ...prevPricesRef.current, ...updates };
              setTickers(prev => ({ ...prev, ...updates }));
              setConnected(true);
            }
          }
        } catch {
          // Fall through to simulation
        }
      } else {
        // Simulation fallback
        const updates = {};
        for (const sym of symbols) {
          const prev = prevPricesRef.current[sym]?.price;
          updates[sym] = simulateTicker(sym, prev);
          prevPricesRef.current[sym] = updates[sym];
        }
        setTickers(prev => ({ ...prev, ...updates }));
        setConnected(true);
      }

      if (!destroyed) {
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    }

    // Initial poll immediately
    poll();

    return () => {
      destroyed = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { tickers, connected };
}
