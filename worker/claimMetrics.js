"use strict";

/**
 * claimMetrics — recompute challenge compliance metrics from the immutable
 * `account_ledger`, not the mutable `trades` table or the frontend-set `phase`.
 *
 * WHY
 * ───
 * The legacy claim flow signed payout/transition proofs in a Base44 function
 * that either trusted a frontend-written `phase` field (phase transitions) or
 * read the mutable `trades` table (payouts). This module is the recompute core
 * for the worker-side signing oracle: it derives every metric from
 * `account_ledger` — append-only (UPDATE/DELETE blocked by triggers),
 * service-role-insert-only — keyed consistently on `account_id`.
 *
 * PARITY (critical)
 * ─────────────────
 * `computeMetricsFromLedger` MUST stay bit-for-bit identical to
 * `computeCompliance` in src/lib/compliance.js (the frontend gate) and to
 * `computeMetrics` in base44/functions/generatePayoutProof — the values are
 * ABI-encoded and verified on-chain by ChainFundedPool. Any drift would either
 * reject valid claims or sign a wrong proof. worker/test/claimMetrics.test.cjs
 * locks this against the canonical algorithm.
 *
 * NOTE on integrity: new ledger rows are signed at insert time
 * (ledgerSig.insertLedgerRow). Historical rows may be unsigned until the
 * one-time backfill (worker/scripts/sign-ledger-backfill.js) runs, so
 * `verifyWorkerSig` stays opportunistic; flip `requireSigned` to true once the
 * backfill is complete to make a valid worker_sig mandatory.
 */

function num(v) {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Normalise a timestamptz/ISO value to its UTC calendar day (YYYY-MM-DD),
// matching the frontend's `close_time.split("T")[0]` on a UTC ISO string.
function utcDay(ts) {
  return new Date(ts).toISOString().split("T")[0];
}

/**
 * Recompute the five on-chain compliance metrics from ledger rows.
 *
 * @param {Array<object>} ledgerRows  rows for ONE account_id (any event types;
 *                                     only `trade_close` rows are used here)
 * @param {number} accountSize        starting balance in USD
 * @returns {{grossProfitUsdc:number, worstDailyLossBps:number,
 *            tradingDaysCount:number, maxDrawdownBps:number, bestDayBps:number}}
 *
 * Algorithm is a line-for-line mirror of src/lib/compliance.js#computeCompliance,
 * sourced from `pnl_usdc` / `closed_at` instead of `pnl` / `close_time`.
 */
function computeMetricsFromLedger(ledgerRows, accountSize) {
  // Map trade_close rows into the {pnl, close_time} shape the canonical
  // algorithm expects. Preserve input order so chronological-sort ties resolve
  // identically to the frontend.
  const closed = (ledgerRows || [])
    .filter((r) => r.event_type === "trade_close")
    .map((r) => ({
      pnl:        num(r.pnl_usdc),
      close_time: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    }));

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

/**
 * A claim requires a flat account — every opened position must be closed.
 * Derived from the ledger: a `trade_open` whose `trade_id` has no matching
 * `trade_close` is still open.
 *
 * @returns {{flat:boolean, openTradeIds:string[]}}
 */
function checkFlat(ledgerRows) {
  const rows = ledgerRows || [];
  const closeIds = new Set(
    rows.filter((r) => r.event_type === "trade_close").map((r) => r.trade_id)
  );
  const openTradeIds = rows
    .filter((r) => r.event_type === "trade_open" && !closeIds.has(r.trade_id))
    .map((r) => r.trade_id);
  return { flat: openTradeIds.length === 0, openTradeIds };
}

/**
 * Resolve the account's starting balance from the ledger's `account_created`
 * row, falling back to a caller-supplied value (challenge_accounts.starting_balance)
 * for pre-ledger accounts. `source: "unknown"` signals the caller should NOT
 * sign — we can't recompute against an unknown opening balance.
 *
 * @returns {{startingBalance:number, source:"ledger"|"fallback"|"unknown"}}
 */
function resolveStartingBalance(ledgerRows, fallback) {
  const created = (ledgerRows || []).find((r) => r.event_type === "account_created");
  if (created) {
    const v = num(created.account_size_usdc) || num(created.balance_after);
    if (v > 0) return { startingBalance: v, source: "ledger" };
  }
  const fb = num(fallback);
  if (fb > 0) return { startingBalance: fb, source: "fallback" };
  return { startingBalance: 0, source: "unknown" };
}

/**
 * Opportunistic ledger-integrity check. The write side now signs rows at insert
 * (ledgerSig), but historical rows stay unsigned until the backfill runs, so
 * unsigned rows are tolerated by default. Flip `requireSigned` to true once the
 * backfill is complete to make a valid worker_sig mandatory.
 *
 * @returns {{ok:boolean, unsigned:number, invalid:string[]}}
 */
function verifyWorkerSig(ledgerRows, verifyFn, { requireSigned = false } = {}) {
  const closes = (ledgerRows || []).filter((r) => r.event_type === "trade_close");
  let unsigned = 0;
  const invalid = [];
  for (const r of closes) {
    if (!r.worker_sig) {
      unsigned++;
      if (requireSigned) invalid.push(r.trade_id);
      continue;
    }
    if (typeof verifyFn === "function" && !verifyFn(r)) invalid.push(r.trade_id);
  }
  return { ok: invalid.length === 0, unsigned, invalid };
}

module.exports = {
  computeMetricsFromLedger,
  checkFlat,
  resolveStartingBalance,
  verifyWorkerSig,
  utcDay,
};
