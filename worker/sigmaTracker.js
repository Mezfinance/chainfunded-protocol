"use strict";

/**
 * worker/sigmaTracker.js
 *
 * Rolling-1-hour volatility tracker for Zone Trading. σ is computed from
 * worker 1m candle closes (the same source the chart's mini history
 * uses), refreshed at most once per minute. Every live tick we receive
 * pings warmStart, which short-circuits on its own warmedAt gate — so
 * the hot path is a Map lookup + branch on intra-minute ticks, and a
 * single candle fetch per (symbol, minute).
 *
 * Per-symbol state:
 *   returns:    FIFO queue of the most recent N close-to-close returns
 *               (computed from 1m closes; capped at WINDOW_MIN)
 *   warmedAt:   ms timestamp of the most recent successful refresh
 *   warming:    in-flight flag (prevents overlapping fetches)
 *
 * σ_minute = stdev(returns)
 * annVol   = σ_minute · √(year / 60)
 *
 * Why no incremental live-tick math: the previous version of this file
 * tried to add minute returns from the tick stream itself, which on a
 * minute-boundary new tick compared `first_tick_of_new_minute` against
 * `last_tick_of_old_minute` — those are usually ~100 ms apart, so the
 * "1m return" pushed into the window was a near-zero microstructure
 * move. After a few hours all the proper warm-start returns rolled off
 * and the σ collapsed into the clamp floor. The actual close-to-close
 * candles are the source of truth and we just trust them.
 *
 * Floor + cap on the static fallback annVol prevent pathological windows
 * from blowing the bands (the EWMA env-var names are kept so existing
 * deployments don't need to be re-set).
 */

const candles = require("./candles");

const SECONDS_PER_YEAR = 365 * 24 * 3600;
const MINUTE_MS = 60_000;
const WINDOW_MIN = parseInt(process.env.ZONE_SIGMA_WINDOW_MIN || "60", 10);
const FLOOR_MULT = parseFloat(process.env.ZONE_EWMA_FLOOR_MULT || "0.20");
const CAP_MULT   = parseFloat(process.env.ZONE_EWMA_CAP_MULT   || "5.0");
// Upstream providers rate-limit per IP, and the worker is one IP for everyone (
// the free tier — confirmed via response body `{"error":"too many requests"}`
// with retry-after ~45s). We warm symbols on-demand (when the frontend asks
// via /zone/config?symbol=...) rather than for every feed we receive,
// so a typical session only refreshes 1–3 symbols per minute per machine.
const REFRESH_INTERVAL_MS = MINUTE_MS;
const FAILURE_BACKOFF_MS  = MINUTE_MS;       // floor; retry-after can extend it
const FAILURE_JITTER_MS   = 30_000;          // + 0–30s random

const state = new Map(); // symbol → { returns, warmedAt, warming, nextAttemptAt }

// Canonicalise the symbol for state-lookup. The price tick stream feeds
// symbols in the internal form ("BTCUSDT") while trade placement comes in
// via the display form ("BTC/USDT"). We strip the slash so both forms
// resolve to the same state key. FX / commodities / stocks already use
// matching forms on both sides.
function canonicalSymbol(symbol) {
  if (typeof symbol !== "string") return symbol;
  return symbol.replace(/^([A-Z0-9]+)\/USDT$/, "$1USDT");
}


async function fetchLastHourCandles(symbol) {
  // 70 candles buys a buffer over the 60-minute window for gaps.
  return candles.getCandles(symbol, "1m", 70);
}

// Pulls the last 70 min of 1m closes from the worker's candle module and overwrites
// the symbol's returns window with the close-to-close moves. Self-gated
// via nextAttemptAt — so the hot path can call warmStart on every tick
// and the network fetch only fires once per minute per symbol AT MOST,
// with backoff on failure to avoid retry storms when a provider rate-limits us.
async function warmStart(symbol) {
  symbol = canonicalSymbol(symbol);
  let s = state.get(symbol);
  if (!s) {
    s = { returns: [], warmedAt: 0, warming: false, nextAttemptAt: 0 };
    state.set(symbol, s);
  }
  if (s.warming) return;
  if (Date.now() < s.nextAttemptAt) return;
  s.warming = true;
  try {
    const bars = await fetchLastHourCandles(symbol);
    if (bars.length >= 2) {
      const returns = [];
      for (let i = 1; i < bars.length; i++) {
        const a = bars[i - 1].close, b = bars[i].close;
        if (a > 0 && Number.isFinite(b)) {
          returns.push((b - a) / a);
        }
      }
      s.returns = returns.slice(-WINDOW_MIN);
      s.warmedAt = Date.now();
      s.nextAttemptAt = Date.now() + REFRESH_INTERVAL_MS;
    } else {
      // Empty / sparse response — treat like a failure, backoff
      s.nextAttemptAt = Date.now() + FAILURE_BACKOFF_MS + Math.random() * FAILURE_JITTER_MS;
    }
  } catch (err) {
    // Verbose, structured log ONCE per symbol when it's never succeeded —
    // tells us status, retry-after, body excerpt, and the URL we hit so we
    // can copy-paste it into curl and reproduce. Subsequent failures of
    // the same symbol are silent (counted instead — see below).
    if (!s.warmedAt && !s.loggedFailure) {
      s.loggedFailure = true;
      const fields = {
        status:      err.status,
        retryAfter:  err.retryAfter,
        cfRay:       err.cfRay,
        contentType: err.contentType,
        body:        err.body,
        url:         err.url,
        message:     err.message,
      };
      console.warn(`[sigma] warm-start failed for ${symbol}:`, JSON.stringify(fields));
    }
    recordWarmStartFailure(err.status || "ERR");
    s.nextAttemptAt = Date.now() + FAILURE_BACKOFF_MS + Math.random() * FAILURE_JITTER_MS;
  } finally {
    s.warming = false;
  }
}

// Periodic summary so even after the per-symbol log fires once we still
// know whether things are recovering. Logs once per minute with the
// count of failures bucketed by HTTP status (or "ERR" for non-HTTP).
const _failureCounts = new Map();
function recordWarmStartFailure(status) {
  _failureCounts.set(status, (_failureCounts.get(status) || 0) + 1);
}
setInterval(() => {
  if (_failureCounts.size === 0) return;
  const summary = Array.from(_failureCounts.entries())
    .map(([s, n]) => `${s}=${n}`).join(" ");
  const succeeded = Array.from(state.values()).filter((s) => s.warmedAt > 0).length;
  const total = state.size;
  console.warn(`[sigma] warm-start summary: ${summary} | warmed=${succeeded}/${total}`);
  _failureCounts.clear();
}, 60_000).unref();

// Kept for backward-compat with executors.js — used to trigger warmStart
// on every tick, which DOSed the upstream provider on cold start (65 symbols ×
// 3 machines). Symbols are now warmed on-demand from /zone/config when the
// frontend explicitly asks for one, so this is a no-op.
function noteTick(_symbol, _price) {}

function rollingSigmaMinute(symbol) {
  const s = state.get(canonicalSymbol(symbol));
  if (!s || s.returns.length < 5) return null;
  const n = s.returns.length;
  let sum = 0;
  for (const r of s.returns) sum += r;
  const mean = sum / n;
  let sumSq = 0;
  for (const r of s.returns) {
    const d = r - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / n);
}

function rollingAnnVol(symbol) {
  const sigMin = rollingSigmaMinute(symbol);
  return sigMin == null ? null : sigMin * Math.sqrt(SECONDS_PER_YEAR / 60);
}

function samplesFor(symbol) {
  const s = state.get(canonicalSymbol(symbol));
  return s ? s.returns.length : 0;
}

/**
 * annVolFor(symbol, fallbackAnnVol):
 *   - rolling-window σ × √(year/60) when the window has ≥5 samples
 *     (warm-start typically fills it in <1s after first tick)
 *   - else fallback (the static low-vol per-pair table)
 *   - clamped to [fallback · FLOOR_MULT, fallback · CAP_MULT] so a brief
 *     calm or fat-finger doesn't blow the bands.
 */
function annVolFor(symbol, fallbackAnnVol) {
  const live = rollingAnnVol(symbol);
  if (live == null || !(fallbackAnnVol > 0)) return fallbackAnnVol;
  return Math.max(fallbackAnnVol * FLOOR_MULT, Math.min(fallbackAnnVol * CAP_MULT, live));
}

function getAnnVolTable(symbols, fallbackLookup) {
  const out = {};
  for (const sym of symbols) {
    const fb = fallbackLookup(sym);
    if (!(fb > 0)) continue;
    out[sym] = annVolFor(sym, fb);
  }
  return out;
}

module.exports = {
  noteTick,
  warmStart,
  annVolFor,
  rollingSigmaMinute,
  rollingAnnVol,
  samplesFor,
  getAnnVolTable,
  canonicalSymbol,
  _state: state,
};
