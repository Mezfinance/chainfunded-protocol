/**
 * worker/prices.js
 *
 * Live price feeds for every asset class. The worker holds these connections
 * and re-broadcasts ticks to traders (see worker/server.js), so an exchange
 * only ever sees the worker's IP — traders in geo-blocked countries are served
 * the same data as everyone else.
 *
 * Two providers behind one interface:
 *   BinancePriceFeed — crypto, public bookTicker streams, no credentials.
 *   EtoroPriceFeed   — FX, commodities and stocks, authenticated WS.
 *
 * Both emit: "price" — { symbol, price, conf, publishTimeMs }
 *
 * `price` is the mid of the live bid/ask. `conf` is half the spread, standing
 * in for Pyth's confidence interval so executors.js#getFreshPrice still refuses
 * to fill when the market is too wide to price fairly. See docs/price-feeds.md.
 */

const { EventEmitter } = require("events");
const WebSocket = require("ws");
const { getAssetClass, isQuoteExpected } = require("./marketHours.cjs");

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

// Silent-death watchdog. A CDN or NAT in the path can drop a long-lived idle
// connection WITHOUT a FIN/RST, leaving a half-open socket that delivers
// nothing yet never fires an error. The stream then stays dead for hours until
// TCP keepalive notices. This was the ~once-a-day "feed downtime" failure mode
// under Pyth and it is provider-independent, so both feeds carry it.
const STALE_TIMEOUT_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 5_000;

// ── Shared base ───────────────────────────────────────────────────────────────

class PriceFeed extends EventEmitter {
  /** @param {string} label short name used in logs */
  constructor(label) {
    super();
    this._label = label;
    this._quotes = new Map();   // symbol -> { bid, ask, publishTimeMs }
    this._conns = [];
    this._destroyed = false;
  }

  start() { throw new Error(`${this._label}: start() not implemented`); }

  destroy() {
    this._destroyed = true;
    for (const conn of this._conns) {
      clearTimeout(conn.retryTimer);
      clearInterval(conn.watchdog);
      if (conn.ws) { try { conn.ws.close(); } catch { /* ignore */ } }
    }
    this._conns = [];
  }

  /**
   * Record one side (or both) of a quote and emit once we hold both.
   *
   * eToro pushes partial updates — some ticks carry only Bid, others only Ask —
   * so sides must be merged into the stored quote rather than replacing it.
   * Replacing would leave a half-quote and produce a nonsense mid.
   */
  _quote(symbol, { bid, ask, publishTimeMs }) {
    if (this._destroyed) return;

    const q = this._quotes.get(symbol) || {};
    if (Number.isFinite(bid) && bid > 0) q.bid = bid;
    if (Number.isFinite(ask) && ask > 0) q.ask = ask;
    if (publishTimeMs != null) q.publishTimeMs = publishTimeMs;
    this._quotes.set(symbol, q);

    if (!(q.bid > 0 && q.ask > 0)) return;
    // A crossed book (bid above ask) means a stale side we haven't refreshed
    // yet; skip rather than emit a negative spread.
    if (q.ask < q.bid) return;

    this.emit("price", {
      symbol,
      price: (q.bid + q.ask) / 2,
      conf: (q.ask - q.bid) / 2,
      publishTimeMs: q.publishTimeMs ?? null,
    });
  }

  /** Create the shared connection record used by the watchdog and backoff. */
  _newConn() {
    const conn = { ws: null, retryTimer: null, watchdog: null, backoff: BASE_BACKOFF_MS, lastData: Date.now() };
    this._conns.push(conn);
    return conn;
  }

  /** Jittered exponential backoff so parallel connections don't retry in lockstep. */
  _scheduleReopen(conn, open) {
    const jittered = Math.round(conn.backoff * (0.5 + Math.random() * 0.5));
    console.warn(`[${this._label}] disconnected — retrying in ${jittered}ms`);
    conn.retryTimer = setTimeout(() => {
      conn.backoff = Math.min(conn.backoff * 2, MAX_BACKOFF_MS);
      open();
    }, jittered);
  }

  /**
   * Force a reconnect when a connected stream goes silent, but only while at
   * least one of its symbols is in an open market — eToro stops publishing
   * closed markets, so a quiet all-stocks connection at 3am is expected, not
   * broken, and reconnecting would just storm the provider for no data.
   */
  _attachWatchdog(conn, symbols, open) {
    conn.watchdog = setInterval(() => {
      if (this._destroyed || !conn.ws) return; // disconnected → close handler owns recovery
      if (Date.now() - conn.lastData < STALE_TIMEOUT_MS) return;

      const now = new Date();
      const expectsData = symbols.some((s) => {
        const klass = getAssetClass(s);
        return klass && isQuoteExpected(klass, now);
      });
      if (!expectsData) return;

      const silentFor = Math.round((Date.now() - conn.lastData) / 1000);
      console.warn(`[${this._label}] no data for ${silentFor}s on an open-market connection — forcing reconnect`);
      conn.lastData = Date.now(); // arm a fresh grace window before re-checking
      try { conn.ws.close(); } catch { /* ignore */ }
      conn.ws = null;
      clearTimeout(conn.retryTimer);
      conn.backoff = BASE_BACKOFF_MS; // dead socket, not a provider rejection — reconnect promptly
      conn.retryTimer = setTimeout(open, 250);
    }, WATCHDOG_INTERVAL_MS);
  }
}

// ── Binance (crypto) ──────────────────────────────────────────────────────────

// Geo fallbacks: the worker has a single egress IP, so if the primary host
// refuses it the feed is dead. Rotating on repeated failure costs nothing.
const BINANCE_HOSTS = [
  "wss://stream.binance.com:9443",
  "wss://stream.binance.us:9443",
  "wss://stream-cloud.tokocrypto.site",
];

// One connection carries every crypto symbol comfortably; chunk only so the
// stream list can't grow into an over-long URL if the asset map expands.
const BINANCE_CHUNK_SIZE = 100;

class BinancePriceFeed extends PriceFeed {
  /** @param {Array<{symbol: string}>} assets e.g. [{ symbol: "BTCUSDT" }] */
  constructor(assets) {
    super("binance");
    this._symbols = assets.map((a) => a.symbol).filter(Boolean);
    this._hostIdx = 0;
  }

  start() {
    if (this._symbols.length === 0) return;
    for (let i = 0; i < this._symbols.length; i += BINANCE_CHUNK_SIZE) {
      this._connect(this._symbols.slice(i, i + BINANCE_CHUNK_SIZE));
    }
  }

  _connect(symbols) {
    const conn = this._newConn();

    const open = () => {
      if (this._destroyed) return;

      // bookTicker is pushed on every book change (sub-second) and carries the
      // best bid/ask we need for both the mid and the spread-derived conf.
      const streams = symbols.map((s) => `${s.toLowerCase()}@bookTicker`).join("/");
      const host = BINANCE_HOSTS[this._hostIdx % BINANCE_HOSTS.length];
      const ws = new WebSocket(`${host}/stream?streams=${streams}`);
      conn.ws = ws;
      conn.lastData = Date.now(); // grace period before the watchdog can fire

      ws.on("open", () => {
        if (this._destroyed) return;
        conn.lastData = Date.now();
        conn.backoff = BASE_BACKOFF_MS;
        console.log(`[binance] connected (${symbols.length} symbols via ${host})`);
      });

      ws.on("message", (raw) => {
        if (this._destroyed) return;
        if (this._ingest(raw)) conn.lastData = Date.now();
      });

      ws.on("error", (err) => {
        // Recovery is the close handler's job, but the reason only appears
        // here — and a silent feed with no explanation is the worst outcome.
        // A 451 means this host geo-blocks the worker's egress IP; the close
        // handler rotates to the next one.
        console.warn(`[binance] socket error via ${host}: ${err.message}`);
      });

      ws.on("close", () => {
        if (this._destroyed) return;
        conn.ws = null;
        // Rotate host only after backing off past the first retry, so a single
        // blip doesn't bounce us onto a worse regional endpoint.
        if (conn.backoff > BASE_BACKOFF_MS) this._hostIdx++;
        this._scheduleReopen(conn, open);
      });
    };

    this._attachWatchdog(conn, symbols, open);
    open();
  }

  /**
   * Parse one combined-stream frame and emit the quote it carries.
   * Split out from the socket handler so the wire format can be exercised
   * without a live connection. Returns true when a frame carried data.
   *
   * Shape: { stream: "btcusdt@bookTicker", data: { s, b, B, a, A, u } }
   */
  _ingest(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return false; }

    const d = msg.data;
    if (!d || !d.s) return false;

    this._quote(d.s, {
      bid: Number(d.b),
      ask: Number(d.a),
      // bookTicker carries no publish timestamp of its own. Leaving it null
      // makes getFreshPrice fall back to receipt age, which on a push stream
      // is the same measurement.
      publishTimeMs: d.E != null ? Number(d.E) : null,
    });
    return true;
  }
}

// ── eToro (FX, commodities, stocks) ───────────────────────────────────────────

const ETORO_WS = "wss://ws.etoro.com/ws";

class EtoroPriceFeed extends PriceFeed {
  /**
   * @param {Array<{symbol: string, etoroId: number}>} assets
   * @param {{ userKey: string, apiKey: string }} credentials
   */
  constructor(assets, { userKey, apiKey } = {}) {
    super("etoro");
    this._assets = assets.filter((a) => a.etoroId != null);
    this._byId = new Map(this._assets.map((a) => [String(a.etoroId), a.symbol]));
    this._userKey = userKey;
    this._apiKey = apiKey;
  }

  start() {
    if (this._assets.length === 0) return;
    if (!this._userKey || !this._apiKey) {
      console.error("[etoro] ETORO_USER_KEY / ETORO_API_KEY not set — FX, commodities and stocks will have no feed");
      return;
    }
    this._connect();
  }

  _connect() {
    const symbols = this._assets.map((a) => a.symbol);
    const conn = this._newConn();

    const open = () => {
      if (this._destroyed) return;

      const ws = new WebSocket(ETORO_WS);
      conn.ws = ws;
      conn.lastData = Date.now();
      let authed = false;

      const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch { /* socket closing */ } };

      ws.on("open", () => {
        if (this._destroyed) return;
        conn.lastData = Date.now();
        // Field naming is inverted from what it reads like: the long base64
        // credential is the userKey, the short opaque one is the apiKey.
        send({ id: randomId(), operation: "Authenticate", data: { userKey: this._userKey, apiKey: this._apiKey } });
      });

      ws.on("message", (raw) => {
        if (this._destroyed) return;

        // A bare `00` keepalive frame is interleaved with the JSON; ignore it
        // rather than letting it fail a parse on every heartbeat.
        const text = raw.toString();
        let d;
        try { d = JSON.parse(text); } catch { return; }

        if (!authed) {
          if (d.operation === "Authenticate" && d.success === true) {
            authed = true;
            conn.backoff = BASE_BACKOFF_MS;
            console.log(`[etoro] authenticated — subscribing to ${this._assets.length} instruments`);
            for (const a of this._assets) {
              send({ id: randomId(), operation: "Subscribe", data: { topics: [`instrument:${a.etoroId}`], snapshot: true } });
            }
            return;
          }
          if (d.success === false) {
            console.error(`[etoro] authentication rejected: ${d.errorCode || ""} ${d.errorMessage || ""}`.trim());
            try { ws.close(); } catch { /* ignore */ }
            return;
          }
        }

        // Ticks arrive wrapped in a messages[] envelope, each with `content` as
        // a stringified JSON blob — not as top-level topic/content fields.
        for (const m of d.messages ?? []) {
          let c;
          try { c = typeof m.content === "string" ? JSON.parse(m.content) : m.content; } catch { continue; }

          const symbol = this._byId.get(String(m.topic).split(":")[1]);
          if (!symbol) continue;

          conn.lastData = Date.now();
          const publishedAt = Date.parse(c.Date ?? "");
          this._quote(symbol, {
            bid: Number(c.Bid),
            ask: Number(c.Ask),
            publishTimeMs: Number.isFinite(publishedAt) ? publishedAt : null,
          });
        }
      });

      ws.on("error", () => { /* close handler owns recovery */ });

      ws.on("close", () => {
        if (this._destroyed) return;
        conn.ws = null;
        this._scheduleReopen(conn, open);
      });
    };

    this._attachWatchdog(conn, symbols, open);
    open();
  }
}

function randomId() {
  // eToro rejects request ids that aren't GUIDs.
  return require("crypto").randomUUID();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { PriceFeed, BinancePriceFeed, EtoroPriceFeed };
