"use strict";

/**
 * ledgerSig — worker signing for account_ledger rows.
 *
 * Every ledger row is signed by the worker key before insertion so the claim
 * signing oracle (and any outside verifier) can prove a row was written by the
 * worker and has not been altered. This is the integrity layer that lets us
 * recompute payout/transition metrics from the ledger and trust them.
 *
 * Canonical message (v1) — MUST be reproducible byte-for-byte at verify time,
 * including across the JS→Postgres→JS round-trip:
 *
 *   "cfledger:v1" ⒟ account_id ⒟ event_type ⒟ trade_id
 *                 ⒟ pnl_usdc(µ) ⒟ balance_after(µ) ⒟ occurred_at(ms)
 *
 *   ⒟           = 0x1f unit separator
 *   numeric(µ)  = Math.round(value * 1e6) as an integer string ("" if null) —
 *                 matches numeric(20,6) storage, so the value read back from
 *                 Postgres normalizes to the same integer the worker signed.
 *   occurred_at = epoch milliseconds (Date.getTime) — independent of how the
 *                 timestamptz is rendered ("...Z" vs "+00:00") on read-back.
 *
 * The hash is keccak256(utf8(message)); the signature is an EIP-191
 * personal_sign over the hash bytes (recoverable with ethers.verifyMessage).
 *
 * Key: WORKER_SIGNER_KEY (falls back to PAYOUT_SIGNER_KEY) — the same worker
 * identity used by base44Bridge. With no key configured, signing is a no-op
 * (rows insert unsigned; append-only triggers + service-role RLS still apply).
 */

const { ethers } = require("ethers");

const KEY = process.env.WORKER_SIGNER_KEY || process.env.PAYOUT_SIGNER_KEY || "";

let _wallet = null;
if (KEY) {
  try {
    _wallet = new ethers.Wallet(KEY);
    console.log(`[ledgerSig] Ledger signer ready: ${_wallet.address}`);
  } catch (err) {
    console.error("[ledgerSig] Invalid signer key:", err.message);
  }
} else {
  console.warn("[ledgerSig] No WORKER_SIGNER_KEY/PAYOUT_SIGNER_KEY — ledger rows will be inserted UNSIGNED");
}

const SEP = "\x1f";

function microField(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1_000_000));
}

function msField(v) {
  if (!v) return "";
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? String(ms) : "";
}

function strField(v) {
  return v === null || v === undefined ? "" : String(v);
}

/** Deterministic canonical message for a ledger row (v1). */
function canonicalLedgerMessage(row) {
  return [
    "cfledger:v1",
    strField(row.account_id),
    strField(row.event_type),
    strField(row.trade_id),
    microField(row.pnl_usdc),
    microField(row.balance_after),
    msField(row.occurred_at),
  ].join(SEP);
}

function ledgerHash(row) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalLedgerMessage(row)));
}

/** Address the worker signs ledger rows with (null if no key configured). */
function signerAddress() {
  return _wallet ? _wallet.address : null;
}

/**
 * Return a copy of `row` with `occurred_at` pinned (so the stored value matches
 * what's signed) and `worker_sig` set. No-op (returns row unchanged) when no
 * key is configured. For backfill, pass a row that already has its stored
 * `occurred_at` so the signature is over the historical timestamp.
 */
async function signLedgerRow(row) {
  if (!_wallet) return row;
  const occurred_at = row.occurred_at || new Date().toISOString();
  const withTs = { ...row, occurred_at };
  const sig = await _wallet.signMessage(ethers.getBytes(ledgerHash(withTs)));
  return { ...withTs, worker_sig: sig };
}

/**
 * Sign and insert a ledger row. Returns the Supabase insert result
 * ({ data, error }) so callers can handle errors as before.
 */
async function insertLedgerRow(supabase, row) {
  const signed = await signLedgerRow(row);
  return supabase.from("account_ledger").insert(signed);
}

/**
 * Verify a stored row's worker_sig recovers to the expected signer.
 * Returns false for unsigned rows (caller decides whether that's fatal).
 */
function verifyLedgerRow(row, expectedAddress = signerAddress()) {
  if (!row || !row.worker_sig || !expectedAddress) return false;
  try {
    const recovered = ethers.verifyMessage(ethers.getBytes(ledgerHash(row)), row.worker_sig);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

module.exports = {
  canonicalLedgerMessage,
  ledgerHash,
  signLedgerRow,
  insertLedgerRow,
  verifyLedgerRow,
  signerAddress,
};
