// Frontend client for the worker claim oracle (worker/claim.js + claimFinalize.js).
//
// The worker recomputes compliance from the immutable ledger and signs the
// on-chain proof; the trader still submits the transaction. Each call is
// authorized with a fresh wallet signature proving the caller owns the account
// (verified worker-side against the account's trader_address).
//
// The auth message MUST match worker/claim.js#buildClaimAuthMessage exactly.

import { workerPost } from "@/lib/workerApi";

export function buildClaimAuthMessage({ action, accountId, issuedAt }) {
  return [
    "ChainFunded claim authorization",
    `Action: ${action}`,
    `Account: ${accountId}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/**
 * Sign a claim authorization and POST to a worker claim endpoint.
 *
 * @param {string} path        e.g. "/claim/phase2-proof"
 * @param {object} opts
 * @param {object} opts.account     thirdweb active account (has .address + .signMessage)
 * @param {string} opts.authAction  the action bound into the signed message
 * @param {string} opts.authAccountId  the account id bound into the signed message
 * @param {object} opts.body        endpoint-specific fields (merged into the request)
 * @returns parsed JSON on success; throws Error(message) on non-2xx.
 */
export async function signedClaimPost(path, { account, authAction, authAccountId, body }) {
  if (!account?.signMessage) throw new Error("Wallet not ready — reconnect and try again");
  const issuedAt = new Date().toISOString();
  const message = buildClaimAuthMessage({ action: authAction, accountId: authAccountId, issuedAt });
  const authSignature = await account.signMessage({ message });

  const res = await workerPost(path, {
    ...body,
    chainId: import.meta.env.VITE_CHAIN_ID,
    traderAddress: account.address,
    issuedAt,
    authSignature,
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const detail = Array.isArray(data?.failures) && data.failures.length ? ` (${data.failures.join("; ")})` : "";
    throw new Error((data?.error || data?.message || `Request failed (${res.status})`) + detail);
  }
  return data;
}
