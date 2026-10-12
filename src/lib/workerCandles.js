/**
 * Historical OHLC from the worker.
 *
 * Candles come from the worker rather than a Vercel function because
 * binance.com refuses US IPs (where Vercel runs) and the eToro credentials
 * belong on one server. The worker routes crypto to Binance klines and
 * everything else to eToro, caches upstream, and returns one normalised shape.
 *
 * Replaces the old /api/pyth-history and /api/daily-opens proxies.
 */

const WORKER_URL = import.meta.env.VITE_WORKER_URL;

/** Timeframes the worker accepts, matching Binance's interval strings. */
export const SUPPORTED_INTERVALS = ["1m", "5m", "10m", "15m", "30m", "1h", "4h", "1d", "1w"];

function workerFetch(path, { timeout = 10_000 } = {}) {
  if (!WORKER_URL) return Promise.reject(new Error("VITE_WORKER_URL is not configured"));
  return fetch(`${WORKER_URL}${path}`, { signal: AbortSignal.timeout(timeout) });
}

/**
 * OHLC for one symbol, oldest first.
 * @returns {Promise<Array<{time:number,open:number,high:number,low:number,close:number,volume:number}>>}
 */
export async function fetchCandles(symbol, interval, limit = 500) {
  const res = await workerFetch(
    `/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`candles HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.candles) ? body.candles : [];
}

/** Rolling 24h open/high/low, or null when there's no history. */
export async function fetch24hStats(symbol) {
  const res = await workerFetch(`/stats24h?symbol=${encodeURIComponent(symbol)}`, { timeout: 8000 });
  if (!res.ok) return null;
  const body = await res.json();
  return Number.isFinite(body.open24h) ? body : null;
}

/**
 * UTC daily opens for many symbols in one request — the asset dropdown's
 * % change. Batched because it is otherwise ~45 requests on every page load.
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchDailyOpens(symbols) {
  const list = [...new Set(symbols.filter(Boolean))].sort();
  if (!list.length) return {};
  const res = await workerFetch(`/daily-opens?symbols=${encodeURIComponent(list.join(","))}`, { timeout: 15_000 });
  if (!res.ok) return {};
  const body = await res.json();
  return body.opens || {};
}
