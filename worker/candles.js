/**
 * worker/candles.js
 *
 * Historical OHLC for charts, 24h stats and the volatility tracker.
 *
 * This lives in the worker rather than a Vercel function for the same reason
 * the live feeds do: Vercel runs in US regions and binance.com refuses US IPs,
 * and the eToro credentials belong on one server rather than in an edge
 * function. One egress IP, both providers, everyone served alike.
 *
 *   Crypto  -> Binance klines (public REST, no credentials)
 *   Rest    -> eToro candles  (authenticated REST)
 *
 * Normalised output, oldest first, matching what lightweight-charts wants:
 *   [{ time: <unix seconds>, open, high, low, close }]
 */

const { randomUUID } = require("crypto");
const { FX_ASSETS, COMMODITY_ASSETS, STOCK_ASSETS } = require("./assetConfig.cjs");

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api.binance.us",
];
const ETORO_BASE = "https://public-api.etoro.com/api/v1";

// Generous, because the worker may be far from eToro: syd was timing out at 15s.
const ETORO_TIMEOUT_MS = Number(process.env.WORKER_CANDLE_TIMEOUT_MS) || 25_000;

// Chart timeframes are Binance-style; eToro uses named intervals.
const ETORO_INTERVALS = {
  "1m": "OneMinute",
  "5m": "FiveMinutes",
  "10m": "TenMinutes",
  "15m": "FifteenMinutes",
  "30m": "ThirtyMinutes",
  "1h": "OneHour",
  "4h": "FourHours",
  "1d": "OneDay",
  "1w": "OneWeek",
};

// eToro caps a single request at ~1000 candles regardless of what you ask for,
// and ignores every date-range parameter (toDate/endDate/before/fromDate were
// all verified to return the newest N anyway). So non-crypto history has a hard
// ceiling of the most recent 1000 bars and cannot be paged backwards.
//
// Measured depth at that ceiling — daily bars only exist on trading days, so
// 1000 of them span ~4 calendar years, more daily history than Binance returns
// in one request:
//   1m ~17h | 1h ~55-59 days | 1d ~1410-1490 days (3.9-4.1 years)
const ETORO_MAX_CANDLES = 1000;

const ETORO_BY_SYMBOL = new Map(
  [...FX_ASSETS, ...COMMODITY_ASSETS, ...STOCK_ASSETS].map((a) => [a.symbol, a.etoroId])
);

// Short-lived cache. The chart polls every 2s for the live candle; without this
// each viewer would produce an upstream request on every poll.
const CACHE_TTL_MS = Number(process.env.WORKER_CANDLE_CACHE_MS) || 5_000;

// A failure is remembered too, briefly. Without this a struggling upstream gets
// a fresh request from every poll of every viewer — exactly when it can least
// afford one. Short enough that a blip recovers quickly.
const NEGATIVE_TTL_MS = Number(process.env.WORKER_CANDLE_ERROR_TTL_MS) || 15_000;

const DAILY_OPEN_GAP_MS = Number(process.env.WORKER_DAILY_OPEN_GAP_MS) || 120;

const cache = new Map(); // key -> { at, value }
const failures = new Map(); // key -> { at, err }

function cached(key, ttl, produce) {
  const now = Date.now();

  const failed = failures.get(key);
  if (failed && now - failed.at < NEGATIVE_TTL_MS) return Promise.reject(failed.err);

  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;

  // Store the promise, not the result, so concurrent callers share one fetch.
  const value = produce().catch((err) => {
    cache.delete(key);
    failures.set(key, { at: Date.now(), err });
    throw err;
  });
  cache.set(key, { at: now, value });
  failures.delete(key);
  return value;
}

function isCrypto(symbol) {
  return !ETORO_BY_SYMBOL.has(symbol);
}

async function fetchBinanceCandles(symbol, interval, limit, endTime) {
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      let url = `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${Math.min(limit, 1000)}`;
      if (endTime) url += `&endTime=${endTime}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("unexpected payload");

      // [ openTime, open, high, low, close, volume, ... ]
      return rows.map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`binance candles failed for ${symbol}: ${lastErr?.message}`);
}

async function fetchEtoroCandles(symbol, interval, limit) {
  const instrumentId = ETORO_BY_SYMBOL.get(symbol);
  if (instrumentId == null) throw new Error(`no eToro instrument for ${symbol}`);

  const etoroInterval = ETORO_INTERVALS[interval];
  if (!etoroInterval) throw new Error(`unsupported interval ${interval}`);

  const userKey = process.env.ETORO_USER_KEY;
  const apiKey = process.env.ETORO_API_KEY;
  if (!userKey || !apiKey) throw new Error("eToro credentials not configured");

  const count = Math.min(limit, ETORO_MAX_CANDLES);
  const url = `${ETORO_BASE}/market-data/instruments/${instrumentId}/history/candles/desc/${etoroInterval}/${count}`;
  const request = () => fetch(url, {
    headers: {
      "x-request-id": randomUUID(),
      "x-api-key": apiKey,
      "x-user-key": userKey,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(ETORO_TIMEOUT_MS),
  });

  // Retry once on a timeout only. Distant regions (syd -> eToro) occasionally
  // exceed the deadline on an otherwise healthy request; an HTTP error is a
  // real answer and gets no retry.
  let res;
  try {
    res = await request();
  } catch (err) {
    if (err?.name !== "TimeoutError" && err?.name !== "AbortError") throw err;
    res = await request();
  }
  if (!res.ok) throw new Error(`eToro candles HTTP ${res.status} for ${symbol}`);

  const body = await res.json();
  // Candles are nested one level and returned newest-first.
  const rows = body?.candles?.[0]?.candles ?? [];
  return rows
    .map((c) => ({
      time: Math.floor(Date.parse(c.fromDate) / 1000),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: 0, // eToro reports null; neither provider gives usable volume
    }))
    .filter((c) => Number.isFinite(c.time) && c.open > 0)
    .sort((a, b) => a.time - b.time);
}

/**
 * OHLC for one symbol, oldest first.
 * @param {string} symbol   e.g. "BTCUSDT", "EUR/USD", "XAU/USD", "AAPL"
 * @param {string} interval Binance-style: 1m 5m 15m 30m 1h 4h 1d 1w
 */
async function getCandles(symbol, interval, limit = 500, endTime = null) {
  // Scroll-back: Binance pages by endTime, eToro cannot. Returning empty for a
  // paged eToro request tells the chart it has reached the start of available
  // history, instead of handing back the same newest bars on every scroll —
  // which the chart would read as more data and request forever.
  if (endTime && !isCrypto(symbol)) return [];

  const key = `c:${symbol}:${interval}:${limit}:${endTime || 0}`;
  return cached(key, CACHE_TTL_MS, () =>
    isCrypto(symbol)
      ? fetchBinanceCandles(symbol, interval, limit, endTime)
      : fetchEtoroCandles(symbol, interval, limit)
  );
}

/**
 * Rolling 24h open/high/low for one symbol, derived from hourly candles.
 * Neither provider publishes 24h stats on the live feed, so they come from
 * history the same way they did under Pyth Benchmarks.
 */
async function get24hStats(symbol) {
  const key = `s24:${symbol}`;
  return cached(key, 60_000, async () => {
    const candles = await getCandles(symbol, "1h", 24);
    if (!candles.length) return null;
    return {
      open24h: candles[0].open,
      high24h: Math.max(...candles.map((c) => c.high)),
      low24h: Math.min(...candles.map((c) => c.low)),
    };
  });
}

/**
 * UTC daily opens for many symbols at once — the asset dropdown's % change.
 * Batched and cached because it is otherwise ~45 requests on every page load.
 */
async function getDailyOpens(symbols) {
  const key = `do:${[...symbols].sort().join(",")}`;
  return cached(key, 5 * 60_000, async () => {
    const opens = {};
    // Sequential and paced on purpose: this is a cold-start burst of ~45
    // requests, and firing them flat out is how you get throttled — which then
    // surfaces as timeouts on unrelated candle requests.
    let first = true;
    for (const symbol of symbols) {
      if (!first) await new Promise((r) => setTimeout(r, DAILY_OPEN_GAP_MS));
      first = false;
      try {
        const candles = await getCandles(symbol, "1d", 1);
        if (candles.length) opens[symbol] = candles[candles.length - 1].open;
      } catch { /* one missing open must not fail the batch */ }
    }
    return opens;
  });
}

module.exports = { getCandles, get24hStats, getDailyOpens, ETORO_INTERVALS };
