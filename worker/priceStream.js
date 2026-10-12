/**
 * worker/priceStream.js
 *
 * Fans the worker's price feeds out to browsers over SSE.
 *
 * The worker holds one upstream connection per provider and every trader reads
 * from here, so an exchange only ever sees the worker's IP — traders in
 * geo-blocked countries get the same data as everyone else, and the price a
 * trader sees is the same tick the worker fills against.
 *
 * Updates are coalesced rather than forwarded per tick: Binance bookTicker can
 * fire many times a second per symbol, and no terminal needs that resolution.
 * Quotes are buffered and flushed on an interval, so cost scales with the
 * flush rate rather than with market activity.
 */

// How often buffered quotes are flushed to subscribers.
const FLUSH_INTERVAL_MS = Number(process.env.WORKER_PRICE_FLUSH_MS) || 250;

// Comment frames keep intermediaries from closing an idle connection and let a
// client notice a dead link during quiet markets.
const HEARTBEAT_MS = Number(process.env.WORKER_PRICE_HEARTBEAT_MS) || 20_000;

// Guard the Fly instance against unbounded held-open connections.
const MAX_SUBSCRIBERS = Number(process.env.WORKER_MAX_PRICE_SUBSCRIBERS) || 2000;

class PriceBroadcaster {
  constructor() {
    this._quotes = new Map();       // symbol -> { price, conf, publishTimeMs, receivedMs }
    this._dirty = new Set();        // symbols changed since the last flush
    this._subscribers = new Set();  // { symbols: Set|null, send, onOverflow }
    this._flushTimer = null;
    this._heartbeatTimer = null;
  }

  /** Mirror a feed's "price" events into the broadcaster. */
  attach(feed) {
    feed.on("price", (quote) => this.note(quote));
    return this;
  }

  note({ symbol, price, conf, publishTimeMs }) {
    if (!symbol || !(price > 0)) return;
    this._quotes.set(symbol, { price, conf, publishTimeMs, receivedMs: Date.now() });
    this._dirty.add(symbol);
  }

  /** Current quote for each requested symbol (all of them when `symbols` is null). */
  snapshot(symbols) {
    const out = {};
    if (!symbols) {
      for (const [sym, q] of this._quotes) out[sym] = q;
      return out;
    }
    for (const sym of symbols) {
      const q = this._quotes.get(sym);
      if (q) out[sym] = q;
    }
    return out;
  }

  get subscriberCount() { return this._subscribers.size; }

  /**
   * Register a listener. `symbols` is a Set to filter on, or null for all.
   * `send` receives a plain object to serialise. Returns an unsubscribe fn,
   * or null when the connection cap is already reached.
   */
  addSubscriber({ symbols = null, send }) {
    if (this._subscribers.size >= MAX_SUBSCRIBERS) return null;

    const sub = { symbols, send };
    this._subscribers.add(sub);
    this._ensureTimers();
    return () => {
      this._subscribers.delete(sub);
      if (this._subscribers.size === 0) this._stopTimers();
    };
  }

  _ensureTimers() {
    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
      this._flushTimer.unref?.();
    }
    if (!this._heartbeatTimer) {
      this._heartbeatTimer = setInterval(() => {
        for (const sub of this._subscribers) {
          try { sub.send(null); } catch { /* dropped on next flush */ }
        }
      }, HEARTBEAT_MS);
      this._heartbeatTimer.unref?.();
    }
  }

  _stopTimers() {
    clearInterval(this._flushTimer);
    clearInterval(this._heartbeatTimer);
    this._flushTimer = null;
    this._heartbeatTimer = null;
  }

  _flush() {
    if (this._dirty.size === 0 || this._subscribers.size === 0) return;

    const changed = [...this._dirty];
    this._dirty.clear();

    for (const sub of this._subscribers) {
      const quotes = {};
      let any = false;
      for (const sym of changed) {
        if (sub.symbols && !sub.symbols.has(sym)) continue;
        const q = this._quotes.get(sym);
        if (!q) continue;
        quotes[sym] = q;
        any = true;
      }
      if (!any) continue;
      // A failed write means the socket is gone; the request's close handler
      // removes it, so swallowing here just avoids taking down the flush loop.
      try { sub.send({ quotes }); } catch { /* ignore */ }
    }
  }

  /** Drop every subscriber and stop timers (shutdown). */
  stop() {
    this._subscribers.clear();
    this._stopTimers();
  }
}

module.exports = { PriceBroadcaster, FLUSH_INTERVAL_MS, HEARTBEAT_MS, MAX_SUBSCRIBERS };
