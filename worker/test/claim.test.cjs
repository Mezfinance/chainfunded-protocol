/**
 * Tests for the claim signing oracle's hash construction and signing.
 *
 * The hashes MUST match ChainFundedPool's keccak256(abi.encode(...)) layouts
 * exactly, and signatures must recover to the configured signer addresses
 * (which the contract checks against authorizedSigners). We set two test keys
 * before requiring the module (it reads keys at import) and an env that mirrors
 * the on-chain config.
 */
process.env.PAYOUT_SIGNER_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
].join(",");
process.env.CHAIN_ID = "1";
process.env.REWARDS_POOL_ADDRESS = "0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc";

const { ethers } = require("ethers");
const claim = require("../claim");

const POOL = ethers.getAddress(process.env.REWARDS_POOL_ADDRESS);
const CHAIN_ID = 1n;
const TRADER = "0x1111111111111111111111111111111111111111";

// Reference: reproduce the contract's expected eth-signed hash for a registration.
function refRegistrationEthHash(trader, fromId, freshId, sizeUsd, dl) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "string", "string", "uint256", "uint256", "uint256", "address"],
    [trader, fromId, freshId, BigInt(Math.round(sizeUsd * 1e6)), dl, CHAIN_ID, POOL]
  );
  return ethers.hashMessage(ethers.getBytes(ethers.keccak256(encoded)));
}

function refPayoutEthHash(trader, accountId, m, payoutId, dl) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address","string","uint256","uint256","uint256","uint256","uint256","string","uint256","uint256","address"],
    [trader, accountId, BigInt(Math.round(m.grossProfitUsdc*1e6)), BigInt(m.worstDailyLossBps),
     BigInt(m.maxDrawdownBps), BigInt(m.tradingDaysCount), BigInt(m.bestDayBps), payoutId, dl, CHAIN_ID, POOL]
  );
  return ethers.hashMessage(ethers.getBytes(ethers.keccak256(encoded)));
}

const SIGNERS = claim._signerAddresses();

describe("claim hash construction + signing", () => {
  it("loaded both signer keys", () => {
    expect(SIGNERS.length).toBe(2);
  });

  it("registration signatures recover to the signer set and are sorted ascending", async () => {
    const dl = 1893456000n; // fixed deadline
    const hash = claim.registrationHash({
      trader: TRADER, fromAccountId: "phase1id0000000000000000", freshAccountId: "phase2id0000000000000000",
      freshSize: 1000, dl,
    });
    const ethHash = refRegistrationEthHash(TRADER, "phase1id0000000000000000", "phase2id0000000000000000", 1000, dl);

    const sigs = await claim.signHash(hash);
    expect(sigs.length).toBe(2);

    const recovered = sigs.map((s) => ethers.recoverAddress(ethHash, s));
    // every recovered address is an authorized signer
    recovered.forEach((a) => expect(SIGNERS.map(x=>x.toLowerCase())).toContain(a.toLowerCase()));
    // sorted strictly ascending (contract's dedupe/order requirement)
    for (let i = 1; i < recovered.length; i++) {
      expect(recovered[i].toLowerCase() > recovered[i-1].toLowerCase()).toBe(true);
    }
  });

  it("payout signatures recover to the signer set", async () => {
    const dl = 1893456000n;
    const m = { grossProfitUsdc: 5000, worstDailyLossBps: 120, maxDrawdownBps: 340, tradingDaysCount: 6, bestDayBps: 4200 };
    const hash = claim.payoutHash({ trader: TRADER, accountId: "acctid000000000000000000", m, payoutId: "payout-1", dl });
    const ethHash = refPayoutEthHash(TRADER, "acctid000000000000000000", m, "payout-1", dl);

    const sigs = await claim.signHash(hash);
    const recovered = sigs.map((s) => ethers.recoverAddress(ethHash, s));
    recovered.forEach((a) => expect(SIGNERS.map(x=>x.toLowerCase())).toContain(a.toLowerCase()));
  });

  it("changing any field changes the hash (binding)", () => {
    const dl = 1893456000n;
    const base = claim.registrationHash({ trader: TRADER, fromAccountId: "a".repeat(24), freshAccountId: "b".repeat(24), freshSize: 1000, dl });
    const diffSize = claim.registrationHash({ trader: TRADER, fromAccountId: "a".repeat(24), freshAccountId: "b".repeat(24), freshSize: 2000, dl });
    const diffTrader = claim.registrationHash({ trader: "0x2222222222222222222222222222222222222222", fromAccountId: "a".repeat(24), freshAccountId: "b".repeat(24), freshSize: 1000, dl });
    expect(base).not.toBe(diffSize);
    expect(base).not.toBe(diffTrader);
  });
});

describe("claim auth message parity", () => {
  it("builds a stable, action-bound message", () => {
    const msg = claim.buildClaimAuthMessage({ action: "phase2", accountId: "acct-1", issuedAt: "2026-06-29T00:00:00.000Z" });
    expect(msg).toContain("ChainFunded claim authorization");
    expect(msg).toContain("Action: phase2");
    expect(msg).toContain("Account: acct-1");
    // a different action yields a different message (no cross-action replay)
    const other = claim.buildClaimAuthMessage({ action: "payout", accountId: "acct-1", issuedAt: "2026-06-29T00:00:00.000Z" });
    expect(msg).not.toBe(other);
  });
});

describe("ruleFailures gating", () => {
  const account = { max_daily_loss_pct: 5, max_total_loss_pct: 10, min_trading_days: 4 };

  it("passes a clean phase-1 account (>=10% profit, within limits)", () => {
    const m = { grossProfitUsdc: 150, worstDailyLossBps: 100, maxDrawdownBps: 200, tradingDaysCount: 5, bestDayBps: 3000 };
    expect(claim.ruleFailures({ metrics: m, account, accountSize: 1000, phase: "phase_1" })).toEqual([]);
  });

  it("fails phase-1 under the profit target", () => {
    const m = { grossProfitUsdc: 50, worstDailyLossBps: 0, maxDrawdownBps: 0, tradingDaysCount: 5, bestDayBps: 0 };
    const f = claim.ruleFailures({ metrics: m, account, accountSize: 1000, phase: "phase_1" });
    expect(f.join(" ")).toMatch(/Profit target/);
  });

  it("fails on daily-loss, total-loss, min-days and best-day breaches", () => {
    const m = { grossProfitUsdc: 200, worstDailyLossBps: 600, maxDrawdownBps: 1100, tradingDaysCount: 2, bestDayBps: 6000 };
    const f = claim.ruleFailures({ metrics: m, account, accountSize: 1000, phase: "phase_1" });
    expect(f.length).toBe(4);
  });

  it("phase-2 uses the 5% target", () => {
    const m = { grossProfitUsdc: 60, worstDailyLossBps: 0, maxDrawdownBps: 0, tradingDaysCount: 5, bestDayBps: 0 };
    expect(claim.ruleFailures({ metrics: m, account, accountSize: 1000, phase: "phase_2" })).toEqual([]); // 60 >= 50
  });
});
