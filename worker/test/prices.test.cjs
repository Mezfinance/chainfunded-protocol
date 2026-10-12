/**
 * Worker price feed tests — connectivity + mock tick processing.
 *
 * Live tests (LIVE_FEEDS=true) connect to real Binance/eToro. eToro also needs
 * ETORO_USER_KEY / ETORO_API_KEY. Everything else runs offline.
 */
const { EventEmitter } = require("events");

const isLive = process.env.LIVE_FEEDS === "true";

describe("Price feed — mock pipeline", () => {
  it("emits price events from mock feed", () => {
    const feed = new EventEmitter();
    const prices = [];

    feed.on("price", (data) => prices.push(data));

    // Simulate ticks
    feed.emit("price", { symbol: "BTCUSDT", price: 60000 });
    feed.emit("price", { symbol: "ETHUSDT", price: 3200 });
    feed.emit("price", { symbol: "BTCUSDT", price: 60100 });

    expect(prices).toHaveLength(3);
    expect(prices[0].symbol).toBe("BTCUSDT");
    expect(prices[0].price).toBe(60000);
    expect(prices[2].price).toBe(60100);
  });

  it("symbol matching handles various formats", () => {
    // Import symbolsMatch indirectly via checkTick behavior
    const { checkTick } = require("../executors");

    const removeFromCache = vi.fn();
    const base44 = {
      entities: {
        Trade: { update: vi.fn(async () => {}) },
        ChallengeAccount: { update: vi.fn(async () => {}) },
      },
    };
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn() })) })) };

    // Trade with "BTC/USDT" format, tick with "BTCUSDT"
    const trade = {
      id: "t1", account_id: "a1", symbol: "BTC/USDT",
      direction: "long", entry_price: 60000, size: 1000,
      sl: 55000, tp: null, status: "open", leverage: 10,
    };

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 54000, // below SL
      pendingOrders: [],
      openTrades: [trade],
      accountCache: new Map([["a1", {
        starting_balance: 10000, current_balance: 10000,
        daily_loss_today: 0, max_daily_loss_pct: 5, max_total_loss_pct: 10,
        phase: "phase_1",
      }]]),
      removeFromCache,
    });

    // Should match BTC/USDT with BTCUSDT and trigger SL
    expect(removeFromCache).toHaveBeenCalledWith("t1");
  });
});

describe("Quote assembly — mid and spread", () => {
  const { BinancePriceFeed, EtoroPriceFeed } = require("../prices");

  it("emits mid price and half-spread as conf", () => {
    const feed = new BinancePriceFeed([{ symbol: "BTCUSDT" }]);
    const got = [];
    feed.on("price", (q) => got.push(q));

    feed._quote("BTCUSDT", { bid: 100, ask: 102, publishTimeMs: 1234 });

    expect(got).toHaveLength(1);
    expect(got[0].price).toBe(101); // mid
    expect(got[0].conf).toBe(1);    // half-spread
    expect(got[0].publishTimeMs).toBe(1234);
  });

  it("withholds a quote until both sides are known", () => {
    const feed = new EtoroPriceFeed([{ symbol: "EUR/USD", etoroId: 1 }], { userKey: "x", apiKey: "y" });
    const got = [];
    feed.on("price", (q) => got.push(q));

    // eToro sends partial updates — one side at a time.
    feed._quote("EUR/USD", { bid: 1.1 });
    expect(got).toHaveLength(0);

    feed._quote("EUR/USD", { ask: 1.2 });
    expect(got).toHaveLength(1);
    expect(got[0].price).toBeCloseTo(1.15, 10);
  });

  it("merges a partial update instead of replacing the stored quote", () => {
    // Replacing rather than merging would drop the known bid and leave a
    // half-quote, so the feed would go silent mid-session.
    const feed = new EtoroPriceFeed([{ symbol: "XAU/USD", etoroId: 18 }], { userKey: "x", apiKey: "y" });
    const got = [];
    feed.on("price", (q) => got.push(q));

    feed._quote("XAU/USD", { bid: 4400, ask: 4402 });
    feed._quote("XAU/USD", { ask: 4404 }); // ask-only tick
    feed._quote("XAU/USD", { bid: 4401 }); // bid-only tick

    expect(got).toHaveLength(3);
    expect(got[1].price).toBe(4402); // (4400 + 4404) / 2 — bid retained
    expect(got[2].price).toBe(4402.5); // (4401 + 4404) / 2 — ask retained
  });

  it("skips a crossed book rather than emitting a negative spread", () => {
    const feed = new BinancePriceFeed([{ symbol: "ETHUSDT" }]);
    const got = [];
    feed.on("price", (q) => got.push(q));

    feed._quote("ETHUSDT", { bid: 2000, ask: 2001 });
    feed._quote("ETHUSDT", { bid: 2050 }); // bid now above the stale ask
    expect(got).toHaveLength(1);
  });

  it("ignores non-positive sides", () => {
    const feed = new BinancePriceFeed([{ symbol: "SOLUSDT" }]);
    const got = [];
    feed.on("price", (q) => got.push(q));

    feed._quote("SOLUSDT", { bid: 0, ask: -1 });
    expect(got).toHaveLength(0);
  });
});

describe("Binance frame parsing", () => {
  const { BinancePriceFeed } = require("../prices");

  function feedWithSink() {
    const feed = new BinancePriceFeed([{ symbol: "BTCUSDT" }]);
    const got = [];
    feed.on("price", (q) => got.push(q));
    return { feed, got };
  }

  it("reads a combined-stream bookTicker frame", () => {
    const { feed, got } = feedWithSink();
    const frame = JSON.stringify({
      stream: "btcusdt@bookTicker",
      data: { u: 1, s: "BTCUSDT", b: "60000.10", B: "1", a: "60000.30", A: "2" },
    });

    expect(feed._ingest(Buffer.from(frame))).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0].symbol).toBe("BTCUSDT");
    expect(got[0].price).toBeCloseTo(60000.2, 6);
    expect(got[0].publishTimeMs).toBe(null); // bookTicker carries no timestamp
  });

  it("uses the event time when the frame carries one", () => {
    const { feed, got } = feedWithSink();
    const frame = JSON.stringify({ data: { s: "BTCUSDT", b: "1", a: "3", E: 1700000000000 } });
    feed._ingest(Buffer.from(frame));
    expect(got[0].publishTimeMs).toBe(1700000000000);
  });

  it("ignores malformed and non-tick frames without throwing", () => {
    const { feed, got } = feedWithSink();
    expect(feed._ingest(Buffer.from("not json"))).toBe(false);
    expect(feed._ingest(Buffer.from(JSON.stringify({ result: null, id: 1 })))).toBe(false);
    expect(feed._ingest(Buffer.from(JSON.stringify({ data: { b: "1", a: "2" } })))).toBe(false); // no symbol
    expect(got).toHaveLength(0);
  });
});

describe.skipIf(!isLive)("Price feed — live connectivity", () => {
  it("Binance WebSocket delivers BTC price within 10s", async () => {
    const { BinancePriceFeed } = require("../prices");
    const feed = new BinancePriceFeed([{ symbol: "BTCUSDT" }]);
    feed.start();

    const price = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        feed.destroy();
        reject(new Error("No BTC price within 10s"));
      }, 10000);

      feed.on("price", (data) => {
        if (data.symbol === "BTCUSDT") {
          clearTimeout(timeout);
          feed.destroy();
          resolve(data.price);
        }
      });
    });

    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(500000); // sanity
  }, 15000);

  it.skipIf(!process.env.ETORO_USER_KEY)("eToro WebSocket delivers EUR/USD within 15s", async () => {
    const { EtoroPriceFeed } = require("../prices");
    const feed = new EtoroPriceFeed([{ symbol: "EUR/USD", etoroId: 1 }], {
      userKey: process.env.ETORO_USER_KEY,
      apiKey: process.env.ETORO_API_KEY,
    });
    feed.start();

    const price = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        feed.destroy();
        reject(new Error("No EUR/USD price within 15s"));
      }, 15000);

      feed.on("price", (data) => {
        if (data.symbol === "EUR/USD") {
          clearTimeout(timeout);
          feed.destroy();
          resolve(data.price);
        }
      });
    });

    expect(price).toBeGreaterThan(0.5);
    expect(price).toBeLessThan(2.0); // sanity
  }, 20000);
});
