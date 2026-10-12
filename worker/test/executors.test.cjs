/**
 * Worker executor unit tests — limit fills, SL/TP, drawdown breach.
 *
 * Tests the checkTick function with mock dependencies (no DB, no network).
 *
 * Writes go through the SIGNED BRIDGE, not the Base44 entity SDK. executors.js
 * never touches `base44.entities` — every account and trade write is a
 * `base44.functions.invoke(<fn>, { ...payload, nonce, signature, signer })` via
 * worker/base44Bridge.js, so the backend can recover the signer address and
 * reject anything the worker did not sign. The mock below therefore exposes
 * only `functions.invoke`; a regression to a direct entity write throws rather
 * than passing silently.
 *
 * base44Bridge reads its signing key at module load, so WORKER_SIGNER_KEY must
 * be set before executors is required.
 */
// Hardhat's published account-0 key — a well-known test value, never a secret.
// vitest runs each worker test file in its own fork (pool: "forks", isolate),
// so this does not leak into tests that assert unsigned behaviour.
process.env.WORKER_SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// vitest globals (describe, it, expect, vi) are auto-injected
const { checkTick } = require("../executors");

// ── Mock factories ───────────────────────────────────────────────────────────

function mockBase44() {
  // Shaped like the Base44 SDK's function-invoke surface. signedInvoke throws
  // on a truthy `error`, so resolve with a bare data envelope.
  return {
    functions: { invoke: vi.fn(async () => ({ data: {} })) },
  };
}

/** Payloads sent to one signed bridge function, in call order. */
function bridgePayloads(base44, functionName) {
  return base44.functions.invoke.mock.calls
    .filter(([name]) => name === functionName)
    .map(([, payload]) => payload);
}

/**
 * The `fields` of every workerUpdateTrade call for a trade. A close can be
 * followed by further writes, so assertions match against the whole list
 * rather than assuming which one lands last.
 */
function tradeUpdates(base44, tradeId) {
  return bridgePayloads(base44, "workerUpdateTrade")
    .filter((p) => p.tradeId === tradeId)
    .map((p) => p.fields);
}

/**
 * The `fields` of every workerUpdateChallengeAccount call for an account.
 * Several reach the same account on one tick — persistCloseBalance writes the
 * derived balance alongside any breach write — so match the list, not the last.
 */
function accountUpdates(base44, accountId) {
  return bridgePayloads(base44, "workerUpdateChallengeAccount")
    .filter((p) => p.accountId === accountId)
    .map((p) => p.fields);
}

/** Asserts some call in `list` matches `shape`. */
function expectSomeUpdate(list, shape) {
  expect(list).toEqual(expect.arrayContaining([expect.objectContaining(shape)]));
}

function mockSupabase(closedTrades = []) {
  // Awaitable + chainable. Supports .update().eq(), .insert(), and
  // .select().in().eq() — the last is used by persistCloseBalance to sum an
  // account's closed-trade pnl when deriving current_balance.
  //
  // `.in` matters: without it that query threw, persistCloseBalance caught the
  // failure and fell back to `current_balance += pnl`, and the derivation this
  // suite exists to check never ran.
  const result = (value) => {
    const thenable = Promise.resolve(value);
    thenable.eq = vi.fn(() => result(value));
    thenable.in = vi.fn(() => result(value));
    return thenable;
  };
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => result({ data: null, error: null })),
      insert: vi.fn(() => result({ data: null, error: null })),
      select: vi.fn(() => result({ data: closedTrades, error: null })),
    })),
  };
}

function makeTrade(overrides = {}) {
  return {
    id: "trade-1",
    account_id: "acct-1",
    symbol: "BTCUSDT",
    direction: "long",
    entry_price: 60000,
    size: 10000,
    leverage: 10,
    sl: null,
    tp: null,
    limit_price: null,
    stop_price: null,
    order_type: "market",
    status: "open",
    ...overrides,
  };
}

function makeAccount(overrides = {}) {
  return {
    id: "acct-1",
    starting_balance: 10000,
    current_balance: 10000,
    daily_loss_today: 0,
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    phase: "phase_1",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("checkTick — Limit Order Fills", () => {
  let base44, supabase, removeFromCache;

  beforeEach(() => {
    base44 = mockBase44();
    supabase = mockSupabase();
    removeFromCache = vi.fn();
  });

  it("fills a long limit order when price drops to limit", async () => {
    const order = makeTrade({
      status: "pending",
      order_type: "limit",
      limit_price: 58000,
      entry_price: null,
    });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 57500, // below limit price
      pendingOrders: [order],
      openTrades: [],
      accountCache: new Map(),
      removeFromCache,
    });

    // Should remove from cache
    expect(removeFromCache).toHaveBeenCalledWith("trade-1");
    // Should fill via the signed bridge
    await vi.waitFor(() => {
      expectSomeUpdate(tradeUpdates(base44, "trade-1"), {
        status: "open",
        entry_price: 58000,
      });
    });
  });

  it("does NOT fill long limit when price above limit", () => {
    const order = makeTrade({
      status: "pending",
      order_type: "limit",
      limit_price: 58000,
      entry_price: null,
    });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 60000, // above limit
      pendingOrders: [order],
      openTrades: [],
      accountCache: new Map(),
      removeFromCache,
    });

    expect(removeFromCache).not.toHaveBeenCalled();
  });

  it("fills a short limit order when price rises to limit", async () => {
    const order = makeTrade({
      id: "trade-2",
      direction: "short",
      order_type: "limit",
      limit_price: 62000,
      entry_price: null,
    });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 62500,
      pendingOrders: [order],
      openTrades: [],
      accountCache: new Map(),
      removeFromCache,
    });

    expect(removeFromCache).toHaveBeenCalledWith("trade-2");
  });
});

describe("checkTick — Stop Loss / Take Profit", () => {
  let base44, supabase, removeFromCache, accountCache;

  beforeEach(() => {
    base44 = mockBase44();
    supabase = mockSupabase();
    removeFromCache = vi.fn();
    accountCache = new Map();
    accountCache.set("acct-1", makeAccount());
  });

  it("closes long position at SL when price drops below", async () => {
    const trade = makeTrade({ sl: 58000, tp: 65000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 57500,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    expect(removeFromCache).toHaveBeenCalledWith("trade-1");
    await vi.waitFor(() => {
      expectSomeUpdate(tradeUpdates(base44, "trade-1"), {
        status: "closed",
        exit_price: 58000,
      });
    });
  });

  it("closes long position at TP when price rises above", async () => {
    const trade = makeTrade({ sl: 58000, tp: 65000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 66000,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    expect(removeFromCache).toHaveBeenCalledWith("trade-1");
    await vi.waitFor(() => {
      expectSomeUpdate(tradeUpdates(base44, "trade-1"), {
        status: "closed",
        exit_price: 65000,
      });
    });
  });

  it("calculates PnL correctly for long SL hit", async () => {
    const trade = makeTrade({ sl: 57000, entry_price: 60000, size: 10000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 56000,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    await vi.waitFor(() => {
      const [fields] = tradeUpdates(base44, "trade-1");
      // PnL = (57000 - 60000) / 60000 * 10000 = -500
      expect(fields?.pnl).toBeCloseTo(-500, 0);
    });
  });

  it("updates account balance in cache after SL (derived from closed trades)", async () => {
    // current_balance is DERIVED from the sum of the account's closed trades,
    // not incremented by this trade's pnl. The two are told apart here by
    // seeding a PRIOR closed trade: deriving gives 10000 + (-50 + -200) = 9750,
    // whereas the old increment path would give 10000 + (-50) = 9950. That is
    // the lost-update regression persistCloseBalance was written to fix, so the
    // fixture has to be able to fail it.
    //
    // Size is $1k, not $10k: at $10k the -0.67% tick move is a 6.67% account
    // loss, which breaches the 5% daily limit and force-closes at market
    // before the SL is ever consulted — the account is then `failed`, which
    // disables derivation entirely. This test is about the derivation, so the
    // position is sized to stay well inside the limits.
    supabase = mockSupabase([{ pnl: -50 }, { pnl: -200 }]);
    const trade = makeTrade({ sl: 57000, entry_price: 60000, size: 1000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 56000,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    const acct = accountCache.get("acct-1");
    await vi.waitFor(() => expect(acct.current_balance).toBeCloseTo(9750, 0));
    expect(acct.phase).not.toBe("failed");
  });

  it("does NOT trigger SL/TP when price is between them", () => {
    const trade = makeTrade({ sl: 58000, tp: 65000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 61000, // between SL and TP
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    expect(removeFromCache).not.toHaveBeenCalled();
  });
});

describe("checkTick — Drawdown Enforcement", () => {
  let base44, supabase, removeFromCache, accountCache;

  beforeEach(() => {
    base44 = mockBase44();
    supabase = mockSupabase();
    removeFromCache = vi.fn();
    accountCache = new Map();
  });

  it("triggers daily loss breach at 5%", async () => {
    // Daily drawdown is measured from day_start_balance — the equity
    // snapshotted at UTC midnight — down to current live equity, as a
    // percentage of starting_balance. It is NOT derived from
    // daily_loss_today, which this fixture used to set on its own, leaving the
    // account inside the limit so no breach ever fired.
    //
    // Opened the day at 10000, realised -400 since, so sitting at 9600.
    const acct = makeAccount({
      starting_balance: 10000,
      day_start_balance: 10000,
      current_balance: 9600,
      daily_loss_today: -400,
    });
    accountCache.set("acct-1", acct);

    // Entry 60000, tick 59000, size 10000 → unrealised = -166.67
    // liveBalance  = 9600 - 166.67 = 9433.33
    // dailyLossPct = (10000 - 9433.33) / 10000 = 5.67% ≥ 5%  → breach
    // totalLossPct = (10000 - 9433.33) / 10000 = 5.67% < 10% → not total
    const trade = makeTrade({ entry_price: 60000, size: 10000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 59000,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    // Should close the trade and fail the account
    await vi.waitFor(() => {
      expectSomeUpdate(accountUpdates(base44, "acct-1"), { phase: "failed" });
    }, { timeout: 5000 });

    // The breach write carries the equity it was computed at. Pinning it means
    // a wrong limit or wrong arithmetic fails here, rather than any failure at
    // all satisfying the test.
    const failed = accountUpdates(base44, "acct-1").find((f) => f.phase === "failed");
    expect(failed.current_balance).toBeCloseTo(9433.33, 1);
  });

  it("triggers total drawdown breach at 10%", async () => {
    // The daily limit is lifted and the day opened at the current balance, so
    // the only limit that can fire here is the total one. Otherwise a 10% total
    // loss necessarily breaches a 5% daily limit too, and this test would pass
    // without the total check working at all.
    const acct = makeAccount({
      starting_balance: 10000,
      day_start_balance: 9200,
      current_balance: 9200,
      daily_loss_today: 0,
      max_daily_loss_pct: 100,
    });
    accountCache.set("acct-1", acct);

    // Entry 60000, price 54000, size 10000 → unrealised = -1000
    // liveBalance  = 9200 + (-1000) = 8200
    // totalLossPct = (10000 - 8200) / 10000 = 18% ≥ 10% → breach
    // dailyLossPct = ( 9200 - 8200) / 10000 = 10%  < 100% → not daily
    const trade = makeTrade({ entry_price: 60000, size: 10000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 54000,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    await vi.waitFor(() => {
      expectSomeUpdate(accountUpdates(base44, "acct-1"), { phase: "failed" });
    }, { timeout: 5000 });

    const failed = accountUpdates(base44, "acct-1").find((f) => f.phase === "failed");
    expect(failed.current_balance).toBeCloseTo(8200, 1);
  });

  it("does NOT trigger breach when within limits", () => {
    const acct = makeAccount({ starting_balance: 10000, current_balance: 9900, daily_loss_today: 0 });
    accountCache.set("acct-1", acct);

    // Entry 60000, price 59800, size 1000 → unrealised = -3.33
    const trade = makeTrade({ entry_price: 60000, size: 1000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 59800,
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    // No breach write. Asserted against the bridge: the old assertion watched
    // base44.entities.ChallengeAccount.update, which executors never calls, so
    // it passed no matter what the engine did.
    expect(accountUpdates(base44, "acct-1")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ phase: "failed" })]),
    );
  });

  it("skips already failed accounts", () => {
    const acct = makeAccount({ phase: "failed" });
    accountCache.set("acct-1", acct);

    const trade = makeTrade({ entry_price: 60000, size: 10000 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 40000, // massive loss — should be ignored
      pendingOrders: [],
      openTrades: [trade],
      accountCache,
      removeFromCache,
    });

    // An account already marked failed must not be written again at all.
    expect(accountUpdates(base44, "acct-1")).toEqual([]);
  });

  it("only processes trades matching the tick symbol", () => {
    const acct = makeAccount();
    accountCache.set("acct-1", acct);

    const btcTrade = makeTrade({ symbol: "BTCUSDT", entry_price: 60000 });
    const ethTrade = makeTrade({ id: "trade-eth", symbol: "ETHUSDT", entry_price: 3000, sl: 2800 });

    checkTick({
      base44, supabase,
      symbol: "BTCUSDT",
      price: 61000,
      pendingOrders: [],
      openTrades: [btcTrade, ethTrade],
      accountCache,
      removeFromCache,
    });

    // ETH trade should NOT be processed (different symbol)
    expect(removeFromCache).not.toHaveBeenCalled();
  });
});
