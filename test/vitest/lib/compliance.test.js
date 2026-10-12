import { describe, it, expect } from "vitest";
import { computeCompliance, evaluateMilestones } from "@/lib/compliance";

const ACCOUNT_SIZE = 100_000;

function trade({ pnl, day, status = "closed" }) {
  return { status, pnl, close_time: `${day}T12:00:00Z`, symbol: "BTCUSDT" };
}

describe("computeCompliance", () => {
  it("ignores non-closed trades", () => {
    const trades = [
      trade({ pnl: 5_000, day: "2026-01-01" }),
      { status: "open", pnl: 999_999, close_time: null, symbol: "BTCUSDT" },
    ];
    const c = computeCompliance(trades, ACCOUNT_SIZE);
    expect(c.grossProfitUsdc).toBe(5_000);
    expect(c.tradingDaysCount).toBe(1);
  });

  it("counts distinct trading days", () => {
    const trades = [
      trade({ pnl: 100, day: "2026-01-01" }),
      trade({ pnl: 100, day: "2026-01-02" }),
      trade({ pnl: 100, day: "2026-01-02" }),
    ];
    expect(computeCompliance(trades, ACCOUNT_SIZE).tradingDaysCount).toBe(2);
  });

  it("computes worst day loss in bps relative to account size", () => {
    const trades = [
      trade({ pnl: -2_500, day: "2026-01-01" }), // 2.5% of 100k
      trade({ pnl: 1_000,  day: "2026-01-02" }),
    ];
    expect(computeCompliance(trades, ACCOUNT_SIZE).worstDailyLossBps).toBe(250);
  });

  it("computes max drawdown from starting balance, not from peak", () => {
    const trades = [
      trade({ pnl: 10_000, day: "2026-01-01" }), // peak = 110k
      trade({ pnl: -8_000, day: "2026-01-02" }), // balance 102k — never below start
    ];
    expect(computeCompliance(trades, ACCOUNT_SIZE).maxDrawdownBps).toBe(0);
  });

  it("captures drawdown when balance dips below starting size", () => {
    const trades = [
      trade({ pnl: -3_000, day: "2026-01-01" }),
      trade({ pnl:  1_000, day: "2026-01-02" }),
    ];
    expect(computeCompliance(trades, ACCOUNT_SIZE).maxDrawdownBps).toBe(300);
  });
});

describe("evaluateMilestones", () => {
  const baseAccount = {
    phase: "phase_1",
    starting_balance: ACCOUNT_SIZE,
    account_size: ACCOUNT_SIZE,
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    min_trading_days: 4,
  };

  it("does NOT mark account as passed when only profit target is met", () => {
    // Hits 10% profit target on a single day — but min trading days = 4
    const trades = [trade({ pnl: 10_000, day: "2026-01-01" })];
    const { allPassed, checks } = evaluateMilestones(baseAccount, trades);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.label === "Profit target").passes).toBe(true);
    expect(checks.find((c) => c.label === "Minimum trading days").passes).toBe(false);
  });

  it("marks account as passed only when every milestone clears", () => {
    const trades = [
      trade({ pnl: 3_000, day: "2026-01-01" }),
      trade({ pnl: 3_000, day: "2026-01-02" }),
      trade({ pnl: 3_000, day: "2026-01-03" }),
      trade({ pnl: 1_500, day: "2026-01-04" }), // total 10,500 → >10% target, no day >50%
    ];
    const { allPassed } = evaluateMilestones(baseAccount, trades);
    expect(allPassed).toBe(true);
  });

  it("fails best-day rule when one day dominates total profit", () => {
    const trades = [
      trade({ pnl:    100, day: "2026-01-01" }),
      trade({ pnl:    100, day: "2026-01-02" }),
      trade({ pnl:    100, day: "2026-01-03" }),
      trade({ pnl: 10_000, day: "2026-01-04" }), // 96% of profit on one day
    ];
    const { allPassed, checks } = evaluateMilestones(baseAccount, trades);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.label.startsWith("Best day")).passes).toBe(false);
  });

  it("returns inert result when account is null", () => {
    const result = evaluateMilestones(null, []);
    expect(result.allPassed).toBe(false);
    expect(result.checks).toEqual([]);
  });
});
