/**
 * Fill-freshness guard tests — executors.js#getFreshPrice.
 *
 * The guard is what refuses market fills on a stale/uncertain price (the
 * feed-lag exploit fix). It reads per-symbol freshness recorded by checkTick,
 * so each test ticks a price (with a publish time + confidence) and then probes
 * getFreshPrice at an injected `now`. Limits are per asset class: crypto
 * (Binance, sub-second) defaults to age 2000ms / publish 3000ms / spread 25bps;
 * everything else (eToro, ~2-5s ticks) to 12000ms / 15000ms / 60bps.
 *
 * No DB/network: checkTick with empty caches makes no base44/supabase calls, it
 * just records the price + freshness.
 */
// vitest globals (describe, it, expect) are auto-injected
const { checkTick, getFreshPrice } = require("../executors");

const noopBase44 = { entities: { Trade: { update: async () => {} }, ChallengeAccount: { update: async () => {} } } };
const noopSupabase = { from: () => ({ update: () => ({ eq: () => Promise.resolve({}) }) }) };

function tick(symbol, price, meta) {
  checkTick({
    base44: noopBase44, supabase: noopSupabase,
    symbol, price, meta,
    pendingOrders: [], openTrades: [], accountCache: new Map(),
    removeFromCache: () => {},
  });
}

describe("getFreshPrice — fill-freshness guard", () => {
  it("accepts a fresh, confident, recently-published fill", () => {
    tick("BTCUSDT", 60000, { publishTimeMs: Date.now(), conf: 1 });
    const now = Date.now();
    const r = getFreshPrice("BTCUSDT", now);
    expect(r.price).toBe(60000);
    expect(r.fresh).toBe(true);
    expect(r.reason).toBe(null);
  });

  it("rejects when the feed hasn't ticked recently (receipt age)", () => {
    tick("BTCUSDT", 60000, { publishTimeMs: Date.now(), conf: 1 });
    const r = getFreshPrice("BTCUSDT", Date.now() + 5000); // 5s later, > 2000ms
    expect(r.fresh).toBe(false);
    expect(r.reason).toMatch(/^stale_feed/);
  });

  it("rejects when the provider's publish time is stale", () => {
    tick("ETHUSDT", 2000, { publishTimeMs: Date.now() - 8000, conf: 0.1 }); // published 8s ago
    const r = getFreshPrice("ETHUSDT", Date.now());
    expect(r.fresh).toBe(false);
    expect(r.reason).toMatch(/^stale_publish/);
  });

  it("rejects when the bid/ask spread is wide", () => {
    tick("SOLUSDT", 150, { publishTimeMs: Date.now(), conf: 150 * 0.004 }); // 40 bps
    const r = getFreshPrice("SOLUSDT", Date.now());
    expect(r.fresh).toBe(false);
    expect(r.reason).toMatch(/^wide_spread/);
  });

  it("gives broker-fed symbols the looser limits (crypto limits would reject)", () => {
    // eToro ticks FX every ~2-5s. At 5s a crypto-limit symbol is already stale,
    // but EUR/USD must still fill or nearly every non-crypto trade is refused.
    tick("EUR/USD", 1.1, { publishTimeMs: Date.now(), conf: 0.00001 });
    const fiveSecondsLater = Date.now() + 5000;

    expect(getFreshPrice("EUR/USD", fiveSecondsLater).fresh).toBe(true);

    tick("BTCUSDT", 60000, { publishTimeMs: Date.now(), conf: 1 });
    expect(getFreshPrice("BTCUSDT", fiveSecondsLater).fresh).toBe(false);
  });

  it("still rejects a broker symbol past its own, looser age limit", () => {
    tick("XAU/USD", 4400, { publishTimeMs: Date.now(), conf: 0.1 });
    const r = getFreshPrice("XAU/USD", Date.now() + 20000); // 20s > 12000ms
    expect(r.fresh).toBe(false);
    expect(r.reason).toMatch(/^stale_feed/);
  });

  it("reports no_price for a symbol never seen", () => {
    const r = getFreshPrice("DOGE/USDT", Date.now());
    expect(r.price).toBe(null);
    expect(r.fresh).toBe(false);
    expect(r.reason).toBe("no_price");
  });

  it("normalizes symbol variants (ticked ETHUSDT resolves ETH/USDT)", () => {
    tick("ETHUSDT", 2000, { publishTimeMs: Date.now(), conf: 0.1 });
    const r = getFreshPrice("ETH/USDT", Date.now());
    expect(r.price).toBe(2000);
    expect(r.fresh).toBe(true);
  });

  it("stays fresh when spread is absent (no conf in the tick)", () => {
    // conf is optional; a missing spread must not spuriously block fills.
    tick("BNBUSDT", 600, { publishTimeMs: Date.now() });
    const r = getFreshPrice("BNBUSDT", Date.now());
    expect(r.fresh).toBe(true);
    expect(r.confBps).toBe(null);
  });
});
