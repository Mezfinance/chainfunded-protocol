/**
 * Tests for the finalize reconciler's pure helpers. The on-chain verification
 * and DB writes are integration-level (Sepolia); here we pin the action→phase
 * mapping and the new-account field builder so a regression in those can't
 * silently archive to the wrong phase or mis-shape the new account.
 */
process.env.PAYOUT_SIGNER_KEYS = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.REWARDS_POOL_ADDRESS = "0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc";

const { buildNewAccountRow, ACTIONS } = require("../claimFinalize");

describe("finalize action mapping", () => {
  it("maps each transition to the right on-chain + off-chain phases", () => {
    expect(ACTIONS.phase2).toMatchObject({ newPhaseOnchain: 2, archivePhase: "phase_1_passed", newPhase: "phase_2" });
    expect(ACTIONS.funded).toMatchObject({ newPhaseOnchain: 3, archivePhase: "phase_2_passed", newPhase: "funded" });
    expect(ACTIONS.payout).toMatchObject({ newPhaseOnchain: 3, archivePhase: "paid_out", newPhase: "funded" });
  });
});

describe("buildNewAccountRow", () => {
  const base = {
    newAccountId: "n".repeat(24),
    trader: "0x1111111111111111111111111111111111111111",
    sizeUsd: 1000,
    newPhase: "phase_2",
    apiSecret: "secret",
    today: "2026-06-29",
  };

  it("stamps chain_id (defaults to mainnet, honours the passed chainId)", () => {
    expect(buildNewAccountRow({ ...base, oldAccount: {} }).chain_id).toBe(1);
    expect(buildNewAccountRow({ ...base, oldAccount: {}, chainId: "11155111" }).chain_id).toBe(11155111);
  });

  it("sets account_id to the on-chain id and seeds balances to size", () => {
    const row = buildNewAccountRow({ ...base, oldAccount: {} });
    expect(row.account_id).toBe("n".repeat(24));
    expect(row.starting_balance).toBe(1000);
    expect(row.current_balance).toBe(1000);
    expect(row.peak_balance).toBe(1000);
    expect(row.day_start_balance).toBe(1000);
    expect(row.daily_loss_today).toBe(0);
    expect(row.status).toBe("active");
    expect(row.onchain_registered).toBe(true);
    expect(row).not.toHaveProperty("id"); // Base44 assigns the internal id
  });

  it("copies rule overrides from the old account", () => {
    const row = buildNewAccountRow({ ...base, oldAccount: { max_daily_loss_pct: 4, max_total_loss_pct: 8, min_trading_days: 3 } });
    expect(row.max_daily_loss_pct).toBe(4);
    expect(row.max_total_loss_pct).toBe(8);
    expect(row.min_trading_days).toBe(3);
  });

  it("falls back to default rules when the old account lacks them", () => {
    const row = buildNewAccountRow({ ...base, oldAccount: null });
    expect(row.max_daily_loss_pct).toBe(5);
    expect(row.max_total_loss_pct).toBe(10);
    expect(row.min_trading_days).toBe(4);
  });
});
