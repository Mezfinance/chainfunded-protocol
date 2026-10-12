/**
 * Parity tests for the ledger-based compliance recompute.
 *
 * The worker's claim signing oracle recomputes metrics from `account_ledger`.
 * Those numbers are ABI-encoded and verified on-chain, so they MUST match the
 * canonical algorithm in src/lib/compliance.js#computeCompliance (and the
 * identical copy in base44/functions/generatePayoutProof#computeMetrics).
 *
 * Strategy: embed the canonical algorithm verbatim as the reference, drive both
 * it (from `trades`) and the worker module (from the matching `account_ledger`
 * rows) with the same scenarios, and assert the outputs are identical. Any
 * future drift in claimMetrics.js breaks this test.
 */
// vitest globals (describe, it, expect) are auto-injected
const {
  computeMetricsFromLedger,
  checkFlat,
  resolveStartingBalance,
} = require("../claimMetrics");

// ── Canonical reference (verbatim from src/lib/compliance.js) ──────────────────
function referenceComputeCompliance(trades, accountSize) {
  const closed = (trades || []).filter((t) => t.status === "closed");

  const grossProfitUsdc = closed.reduce((s, t) => s + (t.pnl || 0), 0);

  const byDay = {};
  closed.forEach((t) => {
    if (!t.close_time) return;
    const day = t.close_time.split("T")[0];
    byDay[day] = (byDay[day] || 0) + (t.pnl || 0);
  });
  const dailyValues = Object.values(byDay);
  const worstDayPnl = dailyValues.length > 0 ? Math.min(0, ...dailyValues) : 0;
  const worstDailyLossBps = accountSize > 0
    ? Math.round((-worstDayPnl / accountSize) * 10_000)
    : 0;

  const bestDayProfit = dailyValues.length > 0 ? Math.max(0, ...dailyValues) : 0;
  const bestDayBps = grossProfitUsdc > 0
    ? Math.round((bestDayProfit / grossProfitUsdc) * 10_000)
    : 0;

  const daySet = new Set(
    closed.filter((t) => t.close_time).map((t) => t.close_time.split("T")[0])
  );
  const tradingDaysCount = daySet.size;

  const chronological = [...closed].sort(
    (a, b) => new Date(a.close_time) - new Date(b.close_time)
  );
  let balance = accountSize;
  let minBalance = accountSize;
  chronological.forEach((t) => {
    balance += t.pnl || 0;
    if (balance < minBalance) minBalance = balance;
  });
  const maxDrawdown = Math.max(0, accountSize - minBalance);
  const maxDrawdownBps = accountSize > 0
    ? Math.round((maxDrawdown / accountSize) * 10_000)
    : 0;

  return { grossProfitUsdc, worstDailyLossBps, tradingDaysCount, maxDrawdownBps, bestDayBps };
}

// ── Fixture: build matching account_ledger rows from a list of closed trades ──
// Each trade → a trade_open + trade_close row, in the same order, so the
// recompute sees the same chronological input as the reference.
function buildLedger(trades, accountSize, accountId = "acct-1", trader = "0xabc") {
  const rows = [{
    event_type: "account_created",
    account_id: accountId,
    trader_address: trader,
    account_size_usdc: accountSize,
    balance_after: accountSize,
    phase: 1,
  }];
  trades.forEach((t, i) => {
    const tradeId = t.id || `t${i}`;
    rows.push({
      event_type: "trade_open",
      account_id: accountId,
      trader_address: trader,
      trade_id: tradeId,
    });
    if (t.status === "closed") {
      rows.push({
        event_type: "trade_close",
        account_id: accountId,
        trader_address: trader,
        trade_id: tradeId,
        pnl_usdc: t.pnl,
        closed_at: t.close_time,
      });
    }
  });
  return rows;
}

const D = (day, hh = "12") => `2026-${day}T${hh}:00:00.000Z`;

// ── Scenarios spanning the metric edge cases ──────────────────────────────────
const SCENARIOS = {
  "empty (no trades)": { size: 1000, trades: [] },

  "single winning day": {
    size: 1000,
    trades: [
      { status: "closed", pnl:  50, close_time: D("06-01", "09") },
      { status: "closed", pnl:  70, close_time: D("06-01", "15") },
    ],
  },

  "multi-day mixed with a loss day": {
    size: 1000,
    trades: [
      { status: "closed", pnl:  120, close_time: D("06-01") },
      { status: "closed", pnl:  -80, close_time: D("06-02") },
      { status: "closed", pnl:   40, close_time: D("06-03") },
      { status: "closed", pnl:   90, close_time: D("06-04") },
    ],
  },

  "zero gross profit (wins offset losses)": {
    size: 1000,
    trades: [
      { status: "closed", pnl:  100, close_time: D("06-01") },
      { status: "closed", pnl: -100, close_time: D("06-02") },
    ],
  },

  "net negative": {
    size: 2000,
    trades: [
      { status: "closed", pnl:  -50, close_time: D("06-01") },
      { status: "closed", pnl: -120, close_time: D("06-02") },
      { status: "closed", pnl:   30, close_time: D("06-03") },
    ],
  },

  "best-day concentration": {
    size: 5000,
    trades: [
      { status: "closed", pnl:  900, close_time: D("06-01") },
      { status: "closed", pnl:   50, close_time: D("06-02") },
      { status: "closed", pnl:   50, close_time: D("06-03") },
    ],
  },

  "drawdown dip then recovery": {
    size: 1000,
    trades: [
      { status: "closed", pnl: -150, close_time: D("06-01") }, // dips to 850
      { status: "closed", pnl: -100, close_time: D("06-02") }, // dips to 750 (max DD)
      { status: "closed", pnl:  400, close_time: D("06-03") }, // recovers to 1150
    ],
  },

  "open positions ignored by metrics": {
    size: 1000,
    trades: [
      { status: "closed", pnl:  60, close_time: D("06-01") },
      { status: "open",   pnl: null, close_time: null },
    ],
  },

  "same-instant ties preserve order": {
    size: 1000,
    trades: [
      { status: "closed", pnl:  30, close_time: D("06-01", "10") },
      { status: "closed", pnl: -10, close_time: D("06-01", "10") },
      { status: "closed", pnl:  20, close_time: D("06-01", "10") },
    ],
  },
};

describe("computeMetricsFromLedger — parity with canonical computeCompliance", () => {
  for (const [name, { size, trades }] of Object.entries(SCENARIOS)) {
    it(name, () => {
      const reference = referenceComputeCompliance(trades, size);
      const ledger = buildLedger(trades, size);
      const actual = computeMetricsFromLedger(ledger, size);
      expect(actual).toEqual(reference);
    });
  }

  it("ledger date bucketing handles non-Z UTC offsets identically", () => {
    // Same instants, expressed with +00:00 offset (as Supabase returns timestamptz).
    const trades = [
      { status: "closed", pnl: 100, close_time: "2026-06-01T23:30:00.000Z" },
      { status: "closed", pnl: -40, close_time: "2026-06-02T01:00:00.000Z" },
    ];
    const reference = referenceComputeCompliance(trades, 1000);
    const ledger = buildLedger(trades, 1000).map((r) =>
      r.event_type === "trade_close"
        ? { ...r, closed_at: r.closed_at.replace(".000Z", "+00:00") }
        : r
    );
    expect(computeMetricsFromLedger(ledger, 1000)).toEqual(reference);
  });

  it("string pnl_usdc (numeric from Postgres) is coerced", () => {
    const ledger = [
      { event_type: "account_created", account_size_usdc: 1000, balance_after: 1000 },
      { event_type: "trade_close", trade_id: "t1", pnl_usdc: "123.45", closed_at: D("06-01") },
    ];
    const out = computeMetricsFromLedger(ledger, 1000);
    expect(out.grossProfitUsdc).toBeCloseTo(123.45, 6);
  });
});

describe("checkFlat", () => {
  it("flat when every open has a matching close", () => {
    const ledger = buildLedger(
      [{ status: "closed", pnl: 10, close_time: D("06-01") }],
      1000
    );
    expect(checkFlat(ledger)).toEqual({ flat: true, openTradeIds: [] });
  });

  it("not flat with an unmatched open", () => {
    const ledger = buildLedger(
      [
        { status: "closed", pnl: 10, close_time: D("06-01"), id: "a" },
        { status: "open", pnl: null, close_time: null, id: "b" },
      ],
      1000
    );
    expect(checkFlat(ledger)).toEqual({ flat: false, openTradeIds: ["b"] });
  });
});

describe("resolveStartingBalance", () => {
  it("reads account_created from the ledger", () => {
    const ledger = [{ event_type: "account_created", account_size_usdc: 2500, balance_after: 2500 }];
    expect(resolveStartingBalance(ledger, 999)).toEqual({ startingBalance: 2500, source: "ledger" });
  });

  it("falls back when no account_created row exists", () => {
    expect(resolveStartingBalance([], 1000)).toEqual({ startingBalance: 1000, source: "fallback" });
  });

  it("reports unknown when neither is available", () => {
    expect(resolveStartingBalance([], 0)).toEqual({ startingBalance: 0, source: "unknown" });
  });
});
