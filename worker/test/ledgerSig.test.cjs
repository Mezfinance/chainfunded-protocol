/**
 * Tests for worker ledger-row signing.
 *
 * The critical property: a signature produced at write time must still verify
 * after the row round-trips through Postgres, where numeric(20,6) re-renders
 * numbers ("123.45" → "123.450000") and timestamptz re-renders timestamps
 * ("...Z" → "+00:00"). The canonical message normalizes both, so verification
 * must hold across those representations.
 *
 * A signer key is required to exercise sign/verify, so we set one before
 * requiring the module (it reads the key at import time).
 */
// Deterministic test key (well-known Hardhat account #0 — test only).
process.env.WORKER_SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const { ethers } = require("ethers");
const {
  canonicalLedgerMessage,
  signLedgerRow,
  verifyLedgerRow,
  signerAddress,
} = require("../ledgerSig");

const EXPECTED_ADDR = new ethers.Wallet(process.env.WORKER_SIGNER_KEY).address;

function closeRow(overrides = {}) {
  return {
    event_type: "trade_close",
    account_id: "acct-1",
    trader_address: "0xabc",
    trade_id: "t1",
    pnl_usdc: 123.45,
    balance_after: 1123.45,
    occurred_at: "2026-06-29T01:38:00.000Z",
    ...overrides,
  };
}

describe("ledgerSig", () => {
  it("exposes the configured signer address", () => {
    expect(signerAddress()).toBe(EXPECTED_ADDR);
  });

  it("signs and verifies a row", async () => {
    const signed = await signLedgerRow(closeRow());
    expect(signed.worker_sig).toMatch(/^0x[0-9a-f]+$/i);
    expect(verifyLedgerRow(signed, EXPECTED_ADDR)).toBe(true);
  });

  it("verification survives the Postgres numeric round-trip (123.45 → '123.450000')", async () => {
    const signed = await signLedgerRow(closeRow());
    // Simulate read-back: numeric columns come back as fixed-decimal strings.
    const readBack = {
      ...signed,
      pnl_usdc: "123.450000",
      balance_after: "1123.450000",
    };
    expect(verifyLedgerRow(readBack, EXPECTED_ADDR)).toBe(true);
  });

  it("verification survives the timestamptz round-trip ('...Z' → '+00:00')", async () => {
    const signed = await signLedgerRow(closeRow());
    const readBack = { ...signed, occurred_at: "2026-06-29T01:38:00+00:00" };
    expect(verifyLedgerRow(readBack, EXPECTED_ADDR)).toBe(true);
  });

  it("detects tampering with pnl", async () => {
    const signed = await signLedgerRow(closeRow());
    const tampered = { ...signed, pnl_usdc: 999.99 };
    expect(verifyLedgerRow(tampered, EXPECTED_ADDR)).toBe(false);
  });

  it("detects tampering with account_id", async () => {
    const signed = await signLedgerRow(closeRow());
    const tampered = { ...signed, account_id: "acct-2" };
    expect(verifyLedgerRow(tampered, EXPECTED_ADDR)).toBe(false);
  });

  it("detects tampering with occurred_at", async () => {
    const signed = await signLedgerRow(closeRow());
    const tampered = { ...signed, occurred_at: "2026-06-30T01:38:00.000Z" };
    expect(verifyLedgerRow(tampered, EXPECTED_ADDR)).toBe(false);
  });

  it("backfill preserves a pre-existing occurred_at (signs over stored time)", async () => {
    const historical = closeRow({ occurred_at: "2026-01-01T00:00:00.000Z" });
    const signed = await signLedgerRow(historical);
    expect(signed.occurred_at).toBe("2026-01-01T00:00:00.000Z");
    expect(verifyLedgerRow(signed, EXPECTED_ADDR)).toBe(true);
  });

  it("unsigned rows do not verify", () => {
    expect(verifyLedgerRow(closeRow(), EXPECTED_ADDR)).toBe(false);
  });

  it("null numeric / trade_id fields are handled (account_created row)", async () => {
    const created = {
      event_type: "account_created",
      account_id: "acct-1",
      trader_address: "0xabc",
      trade_id: null,
      pnl_usdc: null,
      balance_after: 1000,
      account_size_usdc: 1000,
      occurred_at: "2026-06-29T01:38:00.000Z",
    };
    const signed = await signLedgerRow(created);
    expect(verifyLedgerRow(signed, EXPECTED_ADDR)).toBe(true);
  });

  it("canonical message is stable and versioned", () => {
    const msg = canonicalLedgerMessage(closeRow());
    expect(msg.startsWith("cfledger:v1\x1f")).toBe(true);
    // pnl 123.45 → micro-int 123450000; balance 1123.45 → 1123450000
    expect(msg).toContain("123450000");
    expect(msg).toContain("1123450000");
  });
});
