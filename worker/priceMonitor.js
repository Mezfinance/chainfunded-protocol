/**
 * worker/priceMonitor.js
 *
 * Watches the live feeds for liveness. Each asset class has exactly one
 * provider (see docs/price-feeds.md), so there is no second source to
 * cross-check against.
 *
 * The signal is PER SOURCE, not per symbol. Binance bookTicker only pushes when
 * the order book changes, so a thin symbol can legitimately go minutes without
 * a tick while the connection is perfectly healthy — per-symbol staleness fired
 * constantly for the likes of ATOMUSDT and told us nothing. A dead feed, by
 * contrast, goes quiet across every one of its symbols at once, which is what
 * this now looks for.
 *
 * Symbols whose market is closed are skipped: providers stop publishing outside
 * session hours, so a quiet stock overnight or FX over the weekend is expected.
 *
 * This is monitoring only. Fills are protected separately and more strictly by
 * executors.js#getFreshPrice, which refuses to trade on a stale price.
 *
 * Emits: "alert" events — { level: "warning"|"critical", type: string, message: string }
 */

const { EventEmitter } = require("events");
const { getAssetClass, isQuoteExpected } = require("./marketHours.cjs");

// A source that has delivered nothing across ALL its open-market symbols for
// this long is genuinely down, not merely quiet.
const SOURCE_SILENCE_MS = Number(process.env.WORKER_FEED_SILENCE_MS) || 60_000;
const CHECK_INTERVAL_MS = 10_000;       // check every 10s

// Repeat interval for an ongoing outage, so a dead feed keeps nagging without
// emitting an alert every single check.
const REALERT_MS = 5 * 60_000;

class PriceMonitor extends EventEmitter {
  constructor() {
    super();
    // Last price per source: { symbol: { binance|etoro: { price, ts } } }
    this._prices = {};
    this._interval = null;
    this._alertedAt = {}; // source -> ms of the last outage alert
  }

  /**
   * Record a price update from a source.
   * @param {string} symbol  e.g. "BTCUSDT" or "BTC/USD"
   * @param {number} price
   * @param {string} source  e.g. "binance" or "etoro"
   */
  recordPrice(symbol, price, source) {
    const normalised = this._normalise(symbol);
    if (!this._prices[normalised]) {
      this._prices[normalised] = {};
    }
    this._prices[normalised][source] = { price, ts: Date.now() };
  }

  /**
   * Start periodic checks.
   */
  start() {
    if (this._interval) return;
    this._interval = setInterval(() => this._check(), CHECK_INTERVAL_MS);
    console.log("[PriceMonitor] Started — checking every", CHECK_INTERVAL_MS / 1000, "s");
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _normalise(symbol) {
    // Normalise to a common format: BTCUSD
    return symbol
      .replace("/", "")
      .replace("USDT", "USD")
      .toUpperCase();
  }

  _check() {
    const now = Date.now();
    const nowDate = new Date();

    // Newest tick per source, counting only symbols whose market is open.
    const freshest = {};
    for (const [symbol, sources] of Object.entries(this._prices)) {
      const klass = getAssetClass(symbol);
      if (klass && !isQuoteExpected(klass, nowDate)) continue;
      for (const [source, data] of Object.entries(sources)) {
        freshest[source] = Math.max(freshest[source] ?? 0, data.ts);
      }
    }

    for (const [source, lastTs] of Object.entries(freshest)) {
      const silentMs = now - lastTs;
      if (silentMs < SOURCE_SILENCE_MS) {
        delete this._alertedAt[source]; // recovered
        continue;
      }
      // Already alerted and not yet time to nag again.
      if (now - (this._alertedAt[source] ?? 0) < REALERT_MS) continue;

      this._alertedAt[source] = now;
      this.emit("alert", {
        level: "critical",
        type: "feed_silent",
        message: `[${source}] no ticks on any open market for ${Math.round(silentMs / 1000)}s — feed may be down`,
        source,
        ageMs: silentMs,
      });
    }
  }
}

module.exports = { PriceMonitor };
