"use strict";

// Admin endpoint: place a challenge account under review (or clear it).
//
// The `under_review` flag is the claim kill-switch — claim.js#prepare refuses to
// sign any proof while it's set. Writing it from the frontend directly failed to
// persist because Base44 permission rules block user-token writes to the field;
// this routes the write through the signature-verified bridge
// (base44.asServiceRole via workerUpdateChallengeAccount), which bypasses the
// rules. Same admin auth as the other /admin/* endpoints.

const { requireAdmin } = require("./adminWallet");
const { workerUpdateChallengeAccount } = require("./base44Bridge");

async function loadAccount(base44, idOrAccountId) {
  const tryFilter = async (f) => {
    try { const r = await base44.entities.ChallengeAccount.filter(f); return Array.isArray(r) ? r[0] : null; }
    catch { return null; }
  };
  return (await tryFilter({ id: idOrAccountId })) || (await tryFilter({ account_id: idOrAccountId }));
}

async function handleReviewAccount({ payload, base44, supabase }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const accountId = String(payload?.accountId || "").trim();
  if (!accountId) return { status: 400, body: { error: "accountId is required" } };
  const underReview = payload?.underReview === true;
  const reason = underReview && payload?.reason ? String(payload.reason).slice(0, 500) : null;

  const account = await loadAccount(base44, accountId);
  if (!account) return { status: 404, body: { error: "Account not found" } };

  const fields = { under_review: underReview, review_reason: reason };

  // Base44 — the claim oracle's source of truth — via the signed bridge.
  try {
    await workerUpdateChallengeAccount(base44, account.id, fields);
  } catch (e) {
    return { status: 502, body: { error: `Base44 update failed: ${e?.message || e}` } };
  }

  // Supabase mirror — best-effort (column may not exist; non-fatal).
  try {
    await supabase.from("challenge_accounts").update(fields)
      .or(`id.eq.${account.id},account_id.eq.${account.account_id || account.id}`);
  } catch { /* non-fatal */ }

  // Verify the write actually persisted (this is exactly what failed before).
  const after = await loadAccount(base44, accountId);
  const persisted = after?.under_review === true;
  if (persisted !== underReview) {
    return { status: 502, body: {
      error: "Write did not persist. Ensure the ChallengeAccount entity in Base44 has an `under_review` (boolean) field, and that the workerUpdateChallengeAccount backend function is deployed.",
    } };
  }

  console.log(`[admin] ${auth.address} set under_review=${underReview} on ${account.account_id || account.id}${reason ? ` (${reason})` : ""}`);
  return { status: 200, body: { ok: true, accountId: account.account_id || account.id, under_review: persisted, review_reason: reason } };
}

module.exports = { handleReviewAccount };
