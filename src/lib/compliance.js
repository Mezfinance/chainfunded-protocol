/**
 * Compliance helpers shared between the trader Claim page and the trading
 * terminal. Both surfaces need to answer the same question: has this account
 * actually finished its phase, satisfying every rule (profit target, daily
 * loss, total loss, minimum trading days, best-day cap) — not just hit the
 * profit target?
 *
 * These metrics are computed client-side for UI gating only; the backend
 * recomputes and signs them independently before they are submitted to the
 * pool contract.
 */

/**
 * Compute rule compliance metrics from the trader's closed trade history.
 * `trades` may include open/pending entries; only `status === "closed"` rows
 * are considered.
 */
export function computeCompliance(trades, accountSize) {
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

/**
 * Evaluate every milestone for the account's current phase. Returns the same
 * `checks` shape Claim.jsx renders, plus an `allPassed` summary the terminal
 * uses to decide whether to lock trading.
 *
 * Account-level rule overrides win; otherwise the supplied `defaults` (read
 * from the on-chain pool) are used. Falls back to historical contract defaults
 * if neither is provided so this stays safe to call before defaults load.
 */
export function evaluateMilestones(account, trades, defaults = null) {
  if (!account) {
    return { checks: [], allPassed: false, profitTargetPasses: false, compliance: null };
  }

  const accountSize = account.starting_balance || account.account_size || 0;
  const compliance = computeCompliance(trades, accountSize);

  const maxDailyLossPct = account.max_daily_loss_pct ?? defaults?.maxDailyLoss ?? 5;
  const maxTotalLossPct = account.max_total_loss_pct ?? defaults?.maxTotalLoss ?? 10;
  const minTradingDays  = account.min_trading_days   ?? defaults?.minTradingDays ?? 4;
  const maxBestDayBps   = defaults?.maxBestDayBps ?? 5000;

  const profitTargetPct = account.phase === "phase_1"
    ? (defaults?.phase1Target ?? 10)
    : account.phase === "phase_2"
      ? (defaults?.phase2Target ?? 5)
      : 0;
  const profitTargetUsdc = accountSize * profitTargetPct / 100;
  const profitTargetPasses = profitTargetPct > 0
    ? compliance.grossProfitUsdc >= profitTargetUsdc
    : compliance.grossProfitUsdc > 0;

  const bestDayPct = (compliance.bestDayBps / 100).toFixed(1);

  const checks = [
    {
      label:  "Profit target",
      detail: profitTargetPct > 0
        ? `Realised P&L: $${compliance.grossProfitUsdc.toFixed(2)} — must be ≥ $${profitTargetUsdc.toFixed(2)} (${profitTargetPct}% of account size)`
        : `Realised P&L: $${compliance.grossProfitUsdc.toFixed(2)} — must be > $0`,
      passes: profitTargetPasses,
    },
    {
      label:  "Daily loss rule",
      detail: `Worst day: ${(compliance.worstDailyLossBps / 100).toFixed(2)}% ≤ ${maxDailyLossPct}% limit`,
      passes: compliance.worstDailyLossBps <= maxDailyLossPct * 100,
    },
    {
      label:  "Total loss rule",
      detail: `Max loss from start: ${(compliance.maxDrawdownBps / 100).toFixed(2)}% ≤ ${maxTotalLossPct}% limit`,
      passes: compliance.maxDrawdownBps <= maxTotalLossPct * 100,
    },
    {
      label:  "Minimum trading days",
      detail: `${compliance.tradingDaysCount} day${compliance.tradingDaysCount !== 1 ? "s" : ""} traded ≥ ${minTradingDays} required`,
      passes: compliance.tradingDaysCount >= minTradingDays,
    },
    {
      label:  `Best day ≤ ${(maxBestDayBps / 100).toFixed(0)}% of total profit`,
      detail: compliance.grossProfitUsdc > 0
        ? `Best day: ${bestDayPct}% of total profit${compliance.bestDayBps > maxBestDayBps ? " — keep trading to dilute" : ""}`
        : "No profit recorded yet",
      value:  compliance.grossProfitUsdc > 0 ? `${bestDayPct}%` : "—",
      passes: compliance.bestDayBps <= maxBestDayBps && compliance.grossProfitUsdc > 0,
    },
  ];

  const allPassed = checks.every((c) => c.passes);

  return { checks, allPassed, profitTargetPasses, compliance, accountSize, profitTargetPct, profitTargetUsdc };
}
