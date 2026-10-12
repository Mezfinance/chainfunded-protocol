"use strict";

/**
 * worker/claimFinalize.js — explicit, verify-then-write claim reconciler.
 *
 * Replaces the fragile browser saga that archived the old account and created
 * the new one across several awaits (the source of the stuck-"passed" state).
 * After the trader's transaction confirms, the browser calls POST /claim/finalize;
 * the worker READS on-chain state (getChallenge) to PROVE the transition really
 * happened, then performs the off-chain writes idempotently.
 *
 *   action "phase2" → after registerPhase2  (old phase_1 → archived, new phase_2)
 *   action "funded" → after registerFunded  (old phase_2 → archived, new funded)
 *   action "payout" → after claimPayout + registerPostPayout (old funded → paid_out, new funded)
 *
 * The worker never initiates anything on-chain — the tx already happened. This
 * only makes the off-chain stores catch up, and is safe to re-run (idempotent
 * on the new account_id already existing).
 *
 * The same core is exposed for the finalize-claim.js CLI (manual reconciliation).
 */

const { ethers } = require("ethers");
const crypto = require("crypto");
const communityAuth = require("./communityAuth");
const { buildClaimAuthMessage } = require("./claim");
const { insertLedgerRow } = require("./ledgerSig");
const { workerUpdateChallengeAccount } = require("./base44Bridge");
const chains = require("./chains");

const GET_CHALLENGE_ABI = [
  "function getChallenge(string accountId) view returns (address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps)",
];

// Resolve a read-only pool contract for the request's chain (cached per chain).
const _poolByChain = {};
function pool(chainId) {
  const chain = chains.getChain(chainId);
  if (!chain) return null;
  const key = chain.chainId.toString();
  if (_poolByChain[key]) return _poolByChain[key];
  const provider = chains.provider(chain);
  if (!provider) return null;
  _poolByChain[key] = new ethers.Contract(chain.pool, GET_CHALLENGE_ABI, provider);
  return _poolByChain[key];
}

const AUTH_FRESHNESS_MS = 10 * 60 * 1000;
const json = (status, body) => ({ status, body });

// action → expected on-chain phase of the NEW challenge + off-chain phases.
const ACTIONS = {
  phase2: { newPhaseOnchain: 2, archivePhase: "phase_1_passed", newPhase: "phase_2" },
  funded: { newPhaseOnchain: 3, archivePhase: "phase_2_passed", newPhase: "funded" },
  payout: { newPhaseOnchain: 3, archivePhase: "paid_out",       newPhase: "funded" },
};

// Supabase challenge_accounts columns the worker recognises (adaptive upsert
// drops anything the live schema doesn't have).
const SUPABASE_ACCOUNT_COLS = [
  "id", "account_id", "trader_address", "account_size", "starting_balance",
  "current_balance", "peak_balance", "phase", "status", "max_daily_loss_pct",
  "max_total_loss_pct", "min_trading_days", "daily_loss_today", "day_start_balance",
  "api_secret", "start_date", "onchain_registered", "chain_id",
];

function pick(obj, cols, denied = new Set()) {
  const out = {};
  for (const k of cols) if (obj[k] !== undefined && obj[k] !== null && !denied.has(k)) out[k] = obj[k];
  return out;
}

async function adaptiveUpsert(supabase, table, row, cols) {
  const denied = new Set();
  for (let i = 0; i < 15; i++) {
    const { error } = await supabase.from(table).upsert(pick(row, cols, denied), { onConflict: "id" });
    if (!error) return { ok: true };
    const m = error.message?.match(/'([^']+)' column/);
    if (!m || denied.has(m[1])) return { ok: false, error: error.message };
    denied.add(m[1]);
  }
  return { ok: false, error: "gave up after 15 retries" };
}

/** Build the new ChallengeAccount field set (pure — unit tested). */
function buildNewAccountRow({ newAccountId, trader, sizeUsd, newPhase, oldAccount, apiSecret, today, chainId }) {
  return {
    account_id:         newAccountId,
    trader_address:     trader,
    chain_id:           Number(chainId) || 1,
    account_size:       sizeUsd,
    starting_balance:   sizeUsd,
    current_balance:    sizeUsd,
    peak_balance:       sizeUsd,
    day_start_balance:  sizeUsd,
    daily_loss_today:   0,
    phase:              newPhase,
    status:             "active",
    max_daily_loss_pct: oldAccount?.max_daily_loss_pct ?? 5,
    max_total_loss_pct: oldAccount?.max_total_loss_pct ?? 10,
    min_trading_days:   oldAccount?.min_trading_days   ?? 4,
    onchain_registered: true,
    api_secret:         apiSecret,
    start_date:         today,
  };
}

async function loadAccount(base44, accountId) {
  const tryFilter = async (f) => {
    try { const r = await base44.entities.ChallengeAccount.filter(f); return Array.isArray(r) ? r[0] : null; }
    catch { return null; }
  };
  return (await tryFilter({ account_id: accountId })) || (await tryFilter({ id: accountId }));
}

/**
 * Core reconcile — used by both the endpoint and the CLI. Verifies the
 * on-chain transition, then archives the old account and creates the new one
 * (Base44 + Supabase + ledger). Idempotent. Returns an HTTP-style result.
 */
async function finalize({ action, oldAccountId, newAccountId, txHash, payoutId, chainId, supabase, base44 }) {
  const cfg = ACTIONS[action];
  if (!cfg) return json(400, { error: `Unknown action '${action}'` });
  if (!oldAccountId || !newAccountId) return json(400, { error: "Missing oldAccountId / newAccountId" });
  if (String(newAccountId).length !== 24) return json(400, { error: "newAccountId must be a 24-char id" });

  const p = pool(chainId);
  if (!p) return json(503, { error: `Pool/RPC not configured for chain ${chainId || chains.DEFAULT_CHAIN_ID}` });

  // ── 1. Verify the on-chain transition actually happened ───────────────────
  let chNew, chOld;
  try {
    [chNew, chOld] = await Promise.all([p.getChallenge(newAccountId), p.getChallenge(oldAccountId)]);
  } catch (e) {
    return json(502, { error: `On-chain read failed: ${e.message}` });
  }
  if (chNew.createdAt === 0n) return json(409, { error: "New challenge not found on-chain — transaction not confirmed?" });
  if (Number(chNew.phase) !== cfg.newPhaseOnchain) {
    return json(409, { error: `New challenge on-chain phase is ${chNew.phase}, expected ${cfg.newPhaseOnchain}` });
  }
  if (chOld.createdAt !== 0n && !chOld.settled) {
    return json(409, { error: "Old challenge is not settled on-chain — transition incomplete" });
  }

  const trader  = ethers.getAddress(chNew.trader);                 // authoritative, from chain
  const sizeUsd = Number(chNew.accountSizeUsdc) / 1_000_000;

  // ── 2. Idempotency — already finalized? ───────────────────────────────────
  const existing = await loadAccount(base44, newAccountId);
  if (existing) {
    return json(200, { status: "already-finalized", newAccountId, newAccountBase44Id: existing.id });
  }

  // ── 3. Archive the old account (Base44 via signed bridge + Supabase) ───────
  const oldAccount = await loadAccount(base44, oldAccountId);
  const archiveFields = { phase: cfg.archivePhase };
  if (action === "payout" && txHash) archiveFields.payout_tx_hash = txHash;
  if (oldAccount) {
    try { await workerUpdateChallengeAccount(base44, oldAccount.id, archiveFields); }
    catch (e) { console.error(`[finalize] Base44 archive old failed: ${e.message}`); }
  }
  await supabase.from("challenge_accounts").update({ phase: cfg.archivePhase }).eq("account_id", oldAccountId);

  // ── 4. Create the new account (Base44 create RLS is open; let it assign id) ─
  const today     = new Date().toISOString().split("T")[0];
  const apiSecret = crypto.randomBytes(24).toString("hex");
  const newRow    = buildNewAccountRow({ newAccountId, trader, sizeUsd, newPhase: cfg.newPhase, oldAccount, apiSecret, today, chainId: chains.getChain(chainId).chainId.toString() });

  let newB44Id = null;
  try {
    const created = await base44.entities.ChallengeAccount.create({ ...newRow, fee_tx_hash: txHash || undefined });
    newB44Id = created?.id || null;
  } catch (e) {
    return json(500, { error: `Failed to create new account in Base44: ${e.message}` });
  }
  if (!newB44Id) return json(500, { error: "Base44 create returned no id" });

  // ── 5. Mirror to Supabase (id = Base44 internal id, account_id = on-chain id) ─
  const sbRow = { ...newRow, id: newB44Id };
  const sbRes = await adaptiveUpsert(supabase, "challenge_accounts", sbRow, SUPABASE_ACCOUNT_COLS);
  if (!sbRes.ok) console.error(`[finalize] Supabase upsert failed: ${sbRes.error}`);

  // ── 6. Ledger account_created row (opening balance for the new account) ────
  try {
    await insertLedgerRow(supabase, {
      event_type: "account_created",
      account_id: newAccountId,
      trader_address: trader,
      account_size_usdc: sizeUsd,
      balance_after: sizeUsd,
      phase: cfg.newPhaseOnchain,
    });
  } catch (e) { console.error(`[finalize] ledger account_created failed: ${e.message}`); }

  // ── 7. Payout-only: settle the Payout record (best-effort, display only) ───
  if (action === "payout" && payoutId) {
    try { await base44.entities.Payout.update(payoutId, { status: "settled", tx_hash: txHash }); }
    catch (e) { console.error(`[finalize] Payout record settle failed (non-blocking): ${e.message}`); }
  }

  console.log(`[finalize] ${action}: archived ${oldAccountId} → created ${newAccountId} (b44 ${newB44Id}) for ${trader}`);
  return json(200, { status: "finalized", newAccountId, newAccountBase44Id: newB44Id });
}

// ── HTTP handler (wallet-authenticated) ──────────────────────────────────────
async function handleFinalize({ payload, supabase, base44 }) {
  const { action, oldAccountId, newAccountId, traderAddress, txHash, payoutId, chainId, issuedAt, authSignature } = payload || {};
  if (!action || !oldAccountId || !traderAddress) {
    return json(400, { error: "Missing action / oldAccountId / traderAddress" });
  }

  // Auth: the caller signs a finalize authorization bound to the old account.
  const account = await loadAccount(base44, oldAccountId);
  if (!account) return json(404, { error: "Account not found" });
  if ((account.trader_address || "").toLowerCase() !== traderAddress.toLowerCase()) {
    return json(403, { error: "Not your account" });
  }
  if (!issuedAt || !authSignature) return json(400, { error: "Missing issuedAt / authSignature" });
  const t = Date.parse(issuedAt);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > AUTH_FRESHNESS_MS) {
    return json(401, { error: "Authorization expired — please retry" });
  }
  const message = buildClaimAuthMessage({ action: `finalize-${action}`, accountId: account.account_id || account.id, issuedAt });
  const ok = await communityAuth.verifySignature({ address: account.trader_address, message, signature: authSignature });
  if (!ok) return json(401, { error: "Authorization signature does not match account owner" });

  return finalize({ action, oldAccountId, newAccountId, txHash, payoutId, chainId, supabase, base44 });
}

module.exports = { handleFinalize, finalize, buildNewAccountRow, ACTIONS };
