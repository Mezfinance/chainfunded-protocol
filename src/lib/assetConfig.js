/**
 * Comprehensive asset configuration for ChainFunded trading platform.
 *
 * Four asset classes: Crypto, FX, Commodities, US Stocks.
 * Each asset defines its symbol, display name, asset class, max leverage,
 * position sizing, market hours, and price feed provider.
 */

// ── Asset Classes ──────────────────────────────────────────────────────────────

export const ASSET_CLASS = {
  CRYPTO: "crypto",
  FX: "fx",
  COMMODITIES: "commodities",
  STOCKS: "stocks",
};

export const ASSET_CLASS_LABELS = {
  [ASSET_CLASS.CRYPTO]: "Crypto",
  [ASSET_CLASS.FX]: "Forex",
  [ASSET_CLASS.COMMODITIES]: "Commodities",
  [ASSET_CLASS.STOCKS]: "US Stocks",
};

// ── Market Hours ───────────────────────────────────────────────────────────────
// Session boundaries are minutes-from-midnight in America/New_York.
// null = 24/7.
//
// They are expressed in Eastern time, not UTC, because that is how the venues
// actually work: the forex week, the CME Globex session and the NYSE/NASDAQ
// bell all roll at a fixed Eastern wall-clock time, so their UTC offset moves
// by an hour with US daylight saving. These were previously frozen as UTC
// hours annotated "(= 5:00 PM ET)", which only held from November to March —
// every summer the whole schedule ran an hour late. See src/lib/marketHours.js.
export const MARKET_HOURS = {
  CRYPTO: null, // 24/7

  // Forex: Sunday 17:00 ET → Friday 17:00 ET (24/5)
  FX: {
    label: "Forex Market",
    openDay: 0,              // Sunday
    openMinute: 17 * 60,     // 17:00 ET
    closeDay: 5,             // Friday
    closeMinute: 17 * 60,    // 17:00 ET
    timezone: "America/New_York",
    description: "Sun 17:00 – Fri 17:00 ET",
  },

  // CME Globex: Sunday 18:00 ET → Friday 17:00 ET, daily break 17:00–18:00 ET
  COMMODITIES: {
    label: "CME Globex",
    openDay: 0,
    openMinute: 18 * 60,     // 18:00 ET
    closeDay: 5,
    closeMinute: 17 * 60,    // 17:00 ET
    dailyBreakStart: 17 * 60,
    dailyBreakEnd: 18 * 60,
    timezone: "America/New_York",
    description: "Sun 18:00 – Fri 17:00 ET (break 17:00–18:00)",
  },

  // NYSE/NASDAQ: Mon–Fri 09:30–16:00 ET
  STOCKS: {
    label: "NYSE / NASDAQ",
    weekdaysOnly: true,
    openMinute: 9 * 60 + 30, // 09:30 ET
    closeMinute: 16 * 60,    // 16:00 ET
    timezone: "America/New_York",
    description: "Mon–Fri 09:30 – 16:00 ET",
  },
};

// ── Price feed ────────────────────────────────────────────────────────────────
// There is no per-asset provider routing in the browser: every symbol streams
// from the worker, which holds the upstream connections (Binance for crypto,
// eToro for everything else). Non-crypto assets carry the eToro instrument id
// the worker subscribes with; crypto is keyed by symbol. See docs/price-feeds.md.

// ── Position Sizing & Leverage ─────────────────────────────────────────────────

/**
 * Per-asset-class leverage limits (prop firm standard):
 *
 * Crypto      — max 10× (large cap), 5× (mid cap)
 * FX          — max 100× (majors), 50× (crosses), 30× (exotics)
 * Commodities — max 20× (metals), 15× (energy), 10× (agriculture)
 * Stocks      — max 5× (all)
 */

// ── Top 20 Crypto by Volume ───────────────────────────────────────────────────

export const CRYPTO_ASSETS = [
  { symbol: "BTCUSDT",  display_name: "BTC/USDT",  base: "BTC",  maxLeverage: 10, minSize: 0.001,  category: "Large Cap" },
  { symbol: "ETHUSDT",  display_name: "ETH/USDT",  base: "ETH",  maxLeverage: 10, minSize: 0.01,   category: "Large Cap" },
  { symbol: "SOLUSDT",  display_name: "SOL/USDT",  base: "SOL",  maxLeverage: 10, minSize: 0.1,    category: "Large Cap" },
  { symbol: "BNBUSDT",  display_name: "BNB/USDT",  base: "BNB",  maxLeverage: 10, minSize: 0.01,   category: "Large Cap" },
  { symbol: "XRPUSDT",  display_name: "XRP/USDT",  base: "XRP",  maxLeverage: 10, minSize: 1,      category: "Large Cap" },
  { symbol: "DOGEUSDT", display_name: "DOGE/USDT", base: "DOGE", maxLeverage: 5,  minSize: 10,     category: "Large Cap" },
  { symbol: "ADAUSDT",  display_name: "ADA/USDT",  base: "ADA",  maxLeverage: 5,  minSize: 1,      category: "Large Cap" },
  { symbol: "AVAXUSDT", display_name: "AVAX/USDT", base: "AVAX", maxLeverage: 5,  minSize: 0.1,    category: "Large Cap" },
  { symbol: "DOTUSDT",  display_name: "DOT/USDT",  base: "DOT",  maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "LINKUSDT", display_name: "LINK/USDT", base: "LINK", maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "SHIBUSDT", display_name: "SHIB/USDT", base: "SHIB", maxLeverage: 5,  minSize: 100000, category: "Mid Cap" },
  { symbol: "UNIUSDT",  display_name: "UNI/USDT",  base: "UNI",  maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "LTCUSDT",  display_name: "LTC/USDT",  base: "LTC",  maxLeverage: 5,  minSize: 0.01,   category: "Mid Cap" },
  { symbol: "NEARUSDT", display_name: "NEAR/USDT", base: "NEAR", maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "APTUSDT",  display_name: "APT/USDT",  base: "APT",  maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "ARBUSDT",  display_name: "ARB/USDT",  base: "ARB",  maxLeverage: 5,  minSize: 1,      category: "Mid Cap" },
  { symbol: "OPUSDT",   display_name: "OP/USDT",   base: "OP",   maxLeverage: 5,  minSize: 1,      category: "Mid Cap" },
  { symbol: "ATOMUSDT", display_name: "ATOM/USDT", base: "ATOM", maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "FILUSDT",  display_name: "FIL/USDT",  base: "FIL",  maxLeverage: 5,  minSize: 0.1,    category: "Mid Cap" },
  { symbol: "SUIUSDT",  display_name: "SUI/USDT",  base: "SUI",  maxLeverage: 5,  minSize: 1,      category: "Mid Cap" },
];

// ── Top 20 FX Pairs by Volume ─────────────────────────────────────────────────
// Feed: Pyth Network Hermes SSE (permissionless, no API key, all jurisdictions)

export const FX_ASSETS = [
  { symbol: "EUR/USD", display_name: "EUR/USD", base: "EUR", quote: "USD", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 1 },
  { symbol: "USD/JPY", display_name: "USD/JPY", base: "USD", quote: "JPY", maxLeverage: 100, minSize: 1000, pipValue: 0.01,   category: "Major", etoroId: 5 },
  { symbol: "GBP/USD", display_name: "GBP/USD", base: "GBP", quote: "USD", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 2 },
  { symbol: "USD/CHF", display_name: "USD/CHF", base: "USD", quote: "CHF", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 6 },
  { symbol: "AUD/USD", display_name: "AUD/USD", base: "AUD", quote: "USD", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 7 },
  { symbol: "USD/CAD", display_name: "USD/CAD", base: "USD", quote: "CAD", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 4 },
  { symbol: "NZD/USD", display_name: "NZD/USD", base: "NZD", quote: "USD", maxLeverage: 100, minSize: 1000, pipValue: 0.0001, category: "Major", etoroId: 3 },
  { symbol: "EUR/GBP", display_name: "EUR/GBP", base: "EUR", quote: "GBP", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 8 },
  { symbol: "EUR/JPY", display_name: "EUR/JPY", base: "EUR", quote: "JPY", maxLeverage: 50, minSize: 1000, pipValue: 0.01,   category: "Cross", etoroId: 10 },
  { symbol: "GBP/JPY", display_name: "GBP/JPY", base: "GBP", quote: "JPY", maxLeverage: 50, minSize: 1000, pipValue: 0.01,   category: "Cross", etoroId: 11 },
  { symbol: "EUR/CHF", display_name: "EUR/CHF", base: "EUR", quote: "CHF", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 9 },
  { symbol: "AUD/JPY", display_name: "AUD/JPY", base: "AUD", quote: "JPY", maxLeverage: 50, minSize: 1000, pipValue: 0.01,   category: "Cross", etoroId: 14 },
  { symbol: "EUR/AUD", display_name: "EUR/AUD", base: "EUR", quote: "AUD", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 12 },
  { symbol: "GBP/CHF", display_name: "GBP/CHF", base: "GBP", quote: "CHF", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 51 },
  { symbol: "USD/SGD", display_name: "USD/SGD", base: "USD", quote: "SGD", maxLeverage: 30, minSize: 1000, pipValue: 0.0001, category: "Exotic", etoroId: 64 },
  { symbol: "EUR/CAD", display_name: "EUR/CAD", base: "EUR", quote: "CAD", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 13 },
  { symbol: "AUD/NZD", display_name: "AUD/NZD", base: "AUD", quote: "NZD", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 48 },
  { symbol: "GBP/AUD", display_name: "GBP/AUD", base: "GBP", quote: "AUD", maxLeverage: 50, minSize: 1000, pipValue: 0.0001, category: "Cross", etoroId: 50 },
  { symbol: "USD/HKD", display_name: "USD/HKD", base: "USD", quote: "HKD", maxLeverage: 30, minSize: 1000, pipValue: 0.0001, category: "Exotic", etoroId: 39 },
  { symbol: "USD/MXN", display_name: "USD/MXN", base: "USD", quote: "MXN", maxLeverage: 30, minSize: 1000, pipValue: 0.0001, category: "Exotic", etoroId: 63 },
];

// ── Top 20 Commodities by Volume ──────────────────────────────────────────────
// Feed: Pyth Network Hermes SSE (spot metals + CFD spot for energy)

export const COMMODITY_ASSETS = [
  // Metals (Pyth spot metal feeds)
  { symbol: "XAU/USD", display_name: "Gold",           base: "XAU", maxLeverage: 20, contractSize: 100,   unit: "oz",   category: "Metals", etoroId: 18 },
  { symbol: "XAG/USD", display_name: "Silver",         base: "XAG", maxLeverage: 20, contractSize: 5000,  unit: "oz",   category: "Metals", etoroId: 19 },
  { symbol: "XPT/USD", display_name: "Platinum",       base: "XPT", maxLeverage: 20,  contractSize: 50,    unit: "oz",   category: "Metals", etoroId: 40 },
  // Energy (Pyth CFD spot feeds)
  { symbol: "WTI/USD", display_name: "Crude Oil (WTI)", base: "CL",  maxLeverage: 15, contractSize: 1000,  unit: "bbl",   category: "Energy", etoroId: 17 },
  { symbol: "BRN/USD", display_name: "Brent Crude",     base: "BRN", maxLeverage: 15, contractSize: 1000,  unit: "bbl",   category: "Energy", etoroId: 341 },

  // Agriculture intentionally omitted: Pyth Hermes only publishes dated futures
  // (SOK6, SON6, …) for soybeans/corn/wheat, no spot feed. Listing a spot
  // SOYBEAN/USD with a futures feed ID would require a roll schedule we don't
  // have, and the previous entry reused LTCUSDT's feed ID by accident.
];

// ── Top 20 US Stocks by Volume + MSTR ─────────────────────────────────────────
// Feed: Pyth Network Hermes SSE (Equity.US feeds)
// Leverage: CFD-style, 5–20× (industry standard for synthetic stock trading)

export const STOCK_ASSETS = [
  { symbol: "AAPL",  display_name: "Apple",             maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1001 },
  { symbol: "MSFT",  display_name: "Microsoft",         maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1004 },
  { symbol: "NVDA",  display_name: "NVIDIA",            maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1137 },
  { symbol: "AMZN",  display_name: "Amazon",            maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1005 },
  { symbol: "GOOGL", display_name: "Alphabet",          maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 6434 },
  { symbol: "META",  display_name: "Meta Platforms",     maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1003 },
  { symbol: "TSLA",  display_name: "Tesla",             maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 1111 },
  { symbol: "AVGO",  display_name: "Broadcom",          maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 4236 },
  { symbol: "JPM",   display_name: "JPMorgan Chase",    maxLeverage: 5, minSize: 0.01, category: "Finance",    etoroId: 1023 },
  { symbol: "V",     display_name: "Visa",              maxLeverage: 5, minSize: 0.01, category: "Finance",    etoroId: 1046 },
  { symbol: "MA",    display_name: "Mastercard",        maxLeverage: 5, minSize: 0.01, category: "Finance",    etoroId: 1041 },
  { symbol: "BAC",   display_name: "Bank of America",   maxLeverage: 5, minSize: 0.01, category: "Finance",    etoroId: 1011 },
  { symbol: "UNH",   display_name: "UnitedHealth",      maxLeverage: 5, minSize: 0.01, category: "Healthcare", etoroId: 1032 },
  { symbol: "JNJ",   display_name: "Johnson & Johnson", maxLeverage: 5, minSize: 0.01, category: "Healthcare", etoroId: 1022 },
  { symbol: "WMT",   display_name: "Walmart",           maxLeverage: 5, minSize: 0.01, category: "Consumer",   etoroId: 1035 },
  { symbol: "PG",    display_name: "Procter & Gamble",  maxLeverage: 5, minSize: 0.01, category: "Consumer",   etoroId: 1029 },
  { symbol: "HD",    display_name: "Home Depot",        maxLeverage: 5, minSize: 0.01, category: "Consumer",   etoroId: 1018 },
  { symbol: "COST",  display_name: "Costco",            maxLeverage: 5, minSize: 0.01, category: "Consumer",   etoroId: 1461 },
  { symbol: "XOM",   display_name: "Exxon Mobil",       maxLeverage: 5, minSize: 0.01, category: "Energy",     etoroId: 1036 },
  { symbol: "MSTR",  display_name: "MicroStrategy",     maxLeverage: 5, minSize: 0.01, category: "Tech",       etoroId: 6473 },
];

// ── Unified Asset Map ──────────────────────────────────────────────────────────
// Flat lookup for any symbol → full config

function buildAssetMap() {
  const map = {};

  for (const a of CRYPTO_ASSETS) {
    map[a.symbol] = { ...a, assetClass: ASSET_CLASS.CRYPTO, marketHours: MARKET_HOURS.CRYPTO };
  }
  for (const a of FX_ASSETS) {
    map[a.symbol] = { ...a, assetClass: ASSET_CLASS.FX, marketHours: MARKET_HOURS.FX };
  }
  for (const a of COMMODITY_ASSETS) {
    map[a.symbol] = { ...a, assetClass: ASSET_CLASS.COMMODITIES, marketHours: MARKET_HOURS.COMMODITIES };
  }
  for (const a of STOCK_ASSETS) {
    map[a.symbol] = { ...a, assetClass: ASSET_CLASS.STOCKS, marketHours: MARKET_HOURS.STOCKS };
  }

  return map;
}

export const ASSET_MAP = buildAssetMap();

/**
 * Look up full config for any symbol.
 * Falls back to crypto defaults if unknown (backward-compatible).
 */
export function getAssetConfig(symbol) {
  // Try exact match first
  if (ASSET_MAP[symbol]) return ASSET_MAP[symbol];

  // Try display_name → symbol lookup (e.g., "BTC/USDT" → "BTCUSDT")
  const normalized = symbol.replace("/", "");
  if (ASSET_MAP[normalized]) return ASSET_MAP[normalized];

  // Unknown symbol — return safe crypto defaults
  return {
    symbol,
    display_name: symbol,
    assetClass: ASSET_CLASS.CRYPTO,
    maxLeverage: 50,
    minSize: 0.01,
    marketHours: MARKET_HOURS.CRYPTO,
  };
}

/**
 * Convert a trade's stored symbol to the key used by the price feed.
 * Crypto trades are stored as "BTC/USDT" but tickers use "BTCUSDT".
 * Forex/commodities/stocks keep the slash: "AUD/USD", "XAU/USD", etc.
 */
export function toPriceFeedSymbol(tradeSymbol) {
  if (!tradeSymbol) return "";
  const config = getAssetConfig(tradeSymbol);
  if (config.assetClass === ASSET_CLASS.CRYPTO) {
    return tradeSymbol.replace("/", "");
  }
  return tradeSymbol;
}

// ── Pyth Benchmarks TradingView symbol mapping ──────────────────────────────
// Used by both the candlestick chart and the price feed to query Pyth Benchmarks.

const PYTH_COMMODITY_TV_MAP = {
  "XAU/USD": "Metal.XAU/USD",
  "XAG/USD": "Metal.XAG/USD",
  "XPT/USD": "Metal.XPT/USD",
  "WTI/USD": "Commodities.USOILSPOT",
  "BRN/USD": "Commodities.UKOILSPOT",
};

export function toPythTVSymbol(symbol) {
  const config = getAssetConfig(symbol);
  const cls = config.assetClass;
  if (cls === "crypto") {
    // BTCUSDT → Crypto.BTC/USD
    const base = config.base || symbol.replace(/USDT$/, "");
    return `Crypto.${base}/USD`;
  }
  if (cls === "fx")          return `FX.${symbol}`;
  if (cls === "stocks")      return `Equity.US.${symbol}/USD`;
  if (cls === "commodities") return PYTH_COMMODITY_TV_MAP[symbol] || `Metal.${symbol}`;
  return symbol;
}

// ── Default pairs to seed into the TradablePair entity ─────────────────────────

export const DEFAULT_TRADABLE_PAIRS = [
  // Crypto (top 20)
  ...CRYPTO_ASSETS.map((a, i) => ({
    symbol: a.symbol,
    display_name: a.display_name,
    asset_class: ASSET_CLASS.CRYPTO,
    enabled: true,
    sort_order: i,
  })),

  // FX (top 20)
  ...FX_ASSETS.map((a, i) => ({
    symbol: a.symbol,
    display_name: a.display_name,
    asset_class: ASSET_CLASS.FX,
    enabled: true,
    sort_order: 100 + i,
  })),

  // Commodities (top 20)
  ...COMMODITY_ASSETS.map((a, i) => ({
    symbol: a.symbol,
    display_name: a.display_name,
    asset_class: ASSET_CLASS.COMMODITIES,
    enabled: true,
    sort_order: 200 + i,
  })),

  // US Stocks (top 20 + MSTR)
  ...STOCK_ASSETS.map((a, i) => ({
    symbol: a.symbol,
    display_name: `${a.symbol} — ${a.display_name}`,
    asset_class: ASSET_CLASS.STOCKS,
    enabled: true,
    sort_order: 300 + i,
  })),
];

// ── Helper: ensure all default pairs exist and have correct asset_class ──────

/**
 * Loads tradable pairs from the DB, seeds missing defaults, and patches any
 * existing rows that are missing their asset_class field.
 * Returns the full, up-to-date pair list.
 *
 * @param {object} TradablePair - base44.entities.TradablePair
 */
export async function ensureTradablePairs(TradablePair) {
  let data = await TradablePair.list("sort_order", 500);

  if (data.length === 0) {
    await TradablePair.bulkCreate(DEFAULT_TRADABLE_PAIRS);
    return TradablePair.list("sort_order", 500);
  }

  // Build a lookup from default symbol → default entry
  const defaultsBySymbol = Object.fromEntries(
    DEFAULT_TRADABLE_PAIRS.map(p => [p.symbol, p])
  );

  // 1. Insert any missing default pairs
  const existingSymbols = new Set(data.map(p => p.symbol));
  const missing = DEFAULT_TRADABLE_PAIRS.filter(p => !existingSymbols.has(p.symbol));
  if (missing.length > 0) {
    await TradablePair.bulkCreate(missing);
  }

  // 2. Remove DB entries that are no longer in the default list
  const defaultSymbols = new Set(DEFAULT_TRADABLE_PAIRS.map(p => p.symbol));
  const stale = data.filter(p => !defaultSymbols.has(p.symbol));
  if (stale.length > 0) {
    await Promise.all(stale.map(p => TradablePair.delete(p.id)));
  }

  // 3. Patch existing pairs that are missing asset_class or sort_order
  const patchPromises = [];
  for (const p of data) {
    const def = defaultsBySymbol[p.symbol];
    if (def && (!p.asset_class || p.asset_class !== def.asset_class)) {
      patchPromises.push(
        TradablePair.update(p.id, {
          asset_class: def.asset_class,
          sort_order: def.sort_order,
        })
      );
    }
  }
  if (patchPromises.length > 0) {
    await Promise.all(patchPromises);
  }

  // Re-fetch if anything changed
  if (missing.length > 0 || patchPromises.length > 0 || stale.length > 0) {
    data = await TradablePair.list("sort_order", 500);
  }

  return data;
}

// ── Leverage presets per asset class ───────────────────────────────────────────

export const LEVERAGE_PRESETS = {
  [ASSET_CLASS.CRYPTO]:      [1, 2, 3, 5, 7, 10],
  [ASSET_CLASS.FX]:          [1, 10, 25, 50, 75, 100],
  [ASSET_CLASS.COMMODITIES]: [1, 3, 5, 10, 15, 20],
  [ASSET_CLASS.STOCKS]:      [1, 2, 3, 4, 5],
};
