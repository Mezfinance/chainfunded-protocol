"use strict";

/**
 * base44Bridge — wallet-signature auth bridge for elevated writes.
 *
 * Base44 has no service-role API key for SDK consumers. Instead,
 * privileged writes route through Base44 backend functions that
 * verify a signature from a known wallet (the WORKER_SIGNER_KEY)
 * and then perform the write via base44.asServiceRole.
 *
 * This module provides:
 *   1. signedInvoke(functionName, op, payload) — the low-level helper
 *   2. workerUpdateChallengeAccount(accountId, fields)
 *   3. workerCreateTrade(trade)  → returns the created entity
 *   4. workerUpdateTrade(tradeId, fields)
 *
 * Wire-up order:
 *   1. Set WORKER_SIGNER_KEY (private key, hex) on Fly
 *      — falls back to PAYOUT_SIGNER_KEY if not set
 *   2. Set the corresponding signer ADDRESS as WORKER_SIGNER_ADDRESS
 *      on the Base44 backend function side (used to verify recovered sig)
 *   3. Create the three backend functions in Base44 (see
 *      docs/base44-backend-functions/README.md for code)
 *   4. Swap the worker's direct base44.entities.X.update/create calls
 *      to use these helpers
 *   5. Apply Base44's recommended rules on ChallengeAccount and Trade
 */

const { ethers } = require("ethers");

const SIGNER_KEY =
  process.env.WORKER_SIGNER_KEY ||
  process.env.PAYOUT_SIGNER_KEY ||
  "";

let signer = null;
if (SIGNER_KEY) {
  try {
    signer = new ethers.Wallet(SIGNER_KEY);
    console.log(`[base44Bridge] Signer ready: ${signer.address}`);
  } catch (err) {
    console.error("[base44Bridge] Invalid signer key:", err.message);
  }
} else {
  console.warn("[base44Bridge] No WORKER_SIGNER_KEY/PAYOUT_SIGNER_KEY set — bridge calls will fail");
}

/**
 * Recursive deterministic JSON encoder. Object keys are sorted at every
 * level so the same payload produces the same string on both worker and
 * backend-function sides — required for the signature to verify.
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/**
 * Sign a payload and invoke a Base44 backend function with the signature.
 *
 *   op       — short operation tag baked into the signed message,
 *              e.g. "updateAccount". Prevents cross-function replay.
 *   payload  — the actual call args (must be JSON-serialisable)
 *
 * The backend function reconstructs canonicalize({ op, nonce, ...payload }),
 * recovers the signer address with ethers.verifyMessage, and compares to
 * the expected WORKER_SIGNER_ADDRESS env var on its side.
 *
 * Replay protection: nonce is a millisecond timestamp; backend rejects
 * anything more than ±60s out of sync.
 */
async function signedInvoke(base44, functionName, op, payload) {
  if (!signer) throw new Error("base44Bridge signer not configured");
  const nonce = Date.now();
  const message = canonicalize({ op, nonce, ...payload });
  const signature = await signer.signMessage(message);

  const resp = await base44.functions.invoke(functionName, {
    ...payload,
    nonce,
    signature,
    signer: signer.address,
  });
  if (resp?.error) throw new Error(`${functionName}: ${resp.error}`);
  // Base44 SDK wraps the function return in { data: ... }, and the function
  // itself returns { data: <entity> } per the README convention — so peel
  // both layers to give callers the entity directly.
  return resp?.data?.data ?? resp?.data ?? resp;
}

// ── Helpers, one per write surface ───────────────────────────────────────────

async function workerUpdateChallengeAccount(base44, accountId, fields) {
  return signedInvoke(base44, "workerUpdateChallengeAccount", "updateAccount", {
    accountId,
    fields,
  });
}

async function workerCreateTrade(base44, trade) {
  return signedInvoke(base44, "workerCreateTrade", "createTrade", { trade });
}

async function workerUpdateTrade(base44, tradeId, fields) {
  return signedInvoke(base44, "workerUpdateTrade", "updateTrade", {
    tradeId,
    fields,
  });
}

module.exports = {
  canonicalize,
  signedInvoke,
  workerUpdateChallengeAccount,
  workerCreateTrade,
  workerUpdateTrade,
};
