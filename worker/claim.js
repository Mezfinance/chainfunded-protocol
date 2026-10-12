"use strict";

/**
 * worker/claim.js — claim signing oracle.
 *
 * Replaces the Base44 proof functions (generatePhase2Proof,
 * generatePostPayoutProof, generatePayoutProof). The worker is now the rules
 * oracle: it recomputes compliance from the immutable, worker-signed
 * account_ledger (not the mutable trades table or a frontend-set phase field),
 * enforces a flat account, and signs the exact hash ChainFundedPool verifies.
 *
 *   POST /claim/phase2-proof   → registerPhase2   (phase 1 → 2)
 *   POST /claim/funded-proof   → registerFunded / registerPostPayout (phase 2 → funded)
 *   POST /claim/payout-proof   → claimPayout      (funded payout)
 *
 * The trader still submits the transaction (the contract gates on
 * msg.sender == trader); these endpoints only produce the signed proof.
 *
 * Auth: the caller signs a short authorization message with their wallet;
 * we verify it recovers to the account's trader_address (EIP-191 + EIP-1271).
 */

const { ethers } = require("ethers");
const communityAuth = require("./communityAuth");
const ledgerSig = require("./ledgerSig");
const {
  computeMetricsFromLedger,
  checkFlat,
  resolveStartingBalance,
  verifyWorkerSig,
} = require("./claimMetrics");

// ── Per-network config ──────────────────────────────────────────────────────
// Pool address, RPC, and signer keys are resolved per request by chainId (see
// chains.js) so one worker signs for mainnet (prod) and Sepolia (testing). The
// chainId is bound into every proof hash, so a request must specify its chain
// (defaulting to CHAIN_ID for back-compat).
const chains = require("./chains");
chains.logChains();

const SIGNATURE_VALIDITY_SECONDS = 24 * 60 * 60;   // proof deadline
const AUTH_FRESHNESS_MS          = 10 * 60 * 1000;  // wallet-auth message age

// ── Default rules (mirror src/lib/compliance.js fallbacks) ──────────────────
const DEFAULTS = { maxDailyLossPct: 5, maxTotalLossPct: 10, minTradingDays: 4, maxBestDayBps: 5000, phase1TargetPct: 10, phase2TargetPct: 5 };

// ── OFAC screening (ported from generatePayoutProof) ────────────────────────
const HARDCODED_SANCTIONED = new Set([
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c','0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e','0xa7e5d5a720f06526557c513402f2e6b5fa20b008',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b','0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a',
  '0x7db418b5d567a4e0e8c59ad71be1fce48f3e6107','0x72a5843cc08275c8171e582972aa4fda8c397b2a',
  '0x7f19720a857f834696350e226716083e4b889060','0x9f4cda013e354b8fc285bf4b9a60460cee7f7ea9',
  '0x3cbded43efdaf0fc77b9c55f6fc9988fcc9b757d','0x2f389ce8bd8ff92de3402ffce4691d17fc4f6535',
  '0x19aa5fe80d33a56d56c78e82ea5e50e5d80b4dff','0xe7aa314c77f4233c18c6cc84384a9247c0cf367b',
  '0x308ed4b7b49797e1a98d3818bff6fe5385410370','0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47b7b41c56258d9c7731abadc360e460','0x53b6936513e738f44fb50d2b9476730c0ab3bfc1',
]);
const CHAINALYSIS_API_KEY = process.env.CHAINALYSIS_API_KEY || "";

async function isAddressSanctioned(addr) {
  if (HARDCODED_SANCTIONED.has(addr.toLowerCase())) return true;
  if (!CHAINALYSIS_API_KEY) return false;
  try {
    const r = await fetch(`https://public.chainalysis.com/api/v1/address/${addr}`, {
      headers: { Accept: "application/json", "X-API-Key": CHAINALYSIS_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) { const d = await r.json(); return !!(d.identifications && d.identifications.length > 0); }
    return false;
  } catch { return false; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const usdcUnits = (usd) => BigInt(Math.round(Number(usd) * 1_000_000));
const json = (status, body) => ({ status, body });

function deadline() {
  return BigInt(Math.floor(Date.now() / 1000) + SIGNATURE_VALIDITY_SECONDS);
}

function chainOrThrow(chainId) {
  const chain = chains.getChain(chainId);
  if (!chain) throw new Error(`Chain ${chainId ?? chains.DEFAULT_CHAIN_ID} not configured`);
  return chain;
}

/** Sign a keccak256 message hash with a chain's signer keys, sorted by address ascending. */
async function signHash(messageHash, chainId) {
  const chain = chainOrThrow(chainId);
  const bytes = ethers.getBytes(messageHash);
  const signed = await Promise.all(
    chain.wallets.map(async (w) => ({ address: w.address, sig: await w.signMessage(bytes) }))
  );
  signed.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  return signed.map((s) => s.sig);
}

/** Hash for registerPhase2 / registerFunded / registerPostPayout (shared layout). */
function registrationHash({ trader, fromAccountId, freshAccountId, freshSize, dl, chainId }) {
  const chain = chainOrThrow(chainId);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "string", "string", "uint256", "uint256", "uint256", "address"],
    [trader, fromAccountId, freshAccountId, usdcUnits(freshSize), dl, chain.chainId, chain.pool]
  );
  return ethers.keccak256(encoded);
}

/** Hash for claimPayout. */
function payoutHash({ trader, accountId, m, payoutId, dl, chainId }) {
  const chain = chainOrThrow(chainId);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "string", "uint256", "uint256", "uint256", "uint256", "uint256", "string", "uint256", "uint256", "address"],
    [trader, accountId, usdcUnits(m.grossProfitUsdc), BigInt(m.worstDailyLossBps), BigInt(m.maxDrawdownBps),
     BigInt(m.tradingDaysCount), BigInt(m.bestDayBps), payoutId, dl, chain.chainId, chain.pool]
  );
  return ethers.keccak256(encoded);
}

/** Canonical wallet-authorization message the frontend signs. Exported for reuse. */
function buildClaimAuthMessage({ action, accountId, issuedAt }) {
  return [
    "ChainFunded claim authorization",
    `Action: ${action}`,
    `Account: ${accountId}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

async function verifyClaimAuth({ payload, account, action }) {
  const { issuedAt, authSignature } = payload || {};
  if (!issuedAt || !authSignature) return { ok: false, error: "Missing issuedAt / authSignature" };
  const t = Date.parse(issuedAt);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > AUTH_FRESHNESS_MS) {
    return { ok: false, error: "Authorization expired — please retry" };
  }
  const message = buildClaimAuthMessage({ action, accountId: account.account_id || account.id, issuedAt });
  const ok = await communityAuth.verifySignature({
    address: account.trader_address, message, signature: authSignature,
  });
  return ok ? { ok: true } : { ok: false, error: "Authorization signature does not match account owner" };
}

// ── Data loading ────────────────────────────────────────────────────────────
async function loadAccount(base44, accountId) {
  const tryFilter = async (f) => {
    try { const r = await base44.entities.ChallengeAccount.filter(f); return Array.isArray(r) ? r[0] : null; }
    catch { return null; }
  };
  return (await tryFilter({ account_id: accountId })) || (await tryFilter({ id: accountId }));
}

async function loadLedger(supabase, accountId) {
  const { data, error } = await supabase
    .from("account_ledger").select("*")
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`ledger read failed: ${error.message}`);
  return data || [];
}

/**
 * Shared: load account + ledger, verify ownership, recompute metrics, enforce
 * flat + (optionally) phase rules. Returns { error } (an HTTP json result) or
 * { account, metrics, accountSize }.
 */
async function prepare({ payload, supabase, base44, action, expectedPhase, gateRules }) {
  if (!chains.getChain(payload?.chainId)) {
    return { error: json(503, { error: `Chain ${payload?.chainId || chains.DEFAULT_CHAIN_ID} not configured for signing` }) };
  }

  const accountId    = payload?.accountId;
  const traderClaim  = payload?.traderAddress;
  if (!accountId || !traderClaim) return { error: json(400, { error: "Missing accountId / traderAddress" }) };

  const account = await loadAccount(base44, accountId);
  if (!account) return { error: json(404, { error: "Account not found" }) };
  if ((account.trader_address || "").toLowerCase() !== traderClaim.toLowerCase()) {
    return { error: json(403, { error: "Not your account" }) };
  }
  // Admin kill-switch: an account flagged under review cannot obtain ANY claim
  // proof (phase-2, funded, or payout), regardless of phase or rule compliance.
  // Flip it with scripts/review-account.js. This is the enforcement lever behind
  // a prohibited-conduct hold (ToS §5 / §11.1(e)): no signed proof → no payout.
  if (account.under_review === true || account.status === "under_review") {
    return { error: json(403, { error: "This account is under review and cannot claim at this time. Please contact support.", code: "under_review" }) };
  }
  if (expectedPhase && account.phase !== expectedPhase) {
    return { error: json(400, { error: `Account is '${account.phase}', must be '${expectedPhase}'` }) };
  }

  const auth = await verifyClaimAuth({ payload, account, action });
  if (!auth.ok) return { error: json(401, { error: auth.error }) };

  const ledger = await loadLedger(supabase, accountId);

  // Ledger integrity: reject tampered rows. Unsigned rows are tolerated
  // (admin_close_trade writes unsigned; backfill covers historical rows).
  const sig = verifyWorkerSig(ledger, ledgerSig.verifyLedgerRow, { requireSigned: false });
  if (!sig.ok) return { error: json(409, { error: `Ledger integrity check failed for trade(s): ${sig.invalid.join(", ")}` }) };

  const { startingBalance, source } = resolveStartingBalance(
    ledger, account.starting_balance ?? account.account_size
  );
  if (source === "unknown") return { error: json(409, { error: "Cannot determine account starting balance" }) };

  const flat = checkFlat(ledger);
  if (!flat.flat) {
    return { error: json(409, { error: `Close all positions first — ${flat.openTradeIds.length} still open` }) };
  }

  const metrics = computeMetricsFromLedger(ledger, startingBalance);

  if (gateRules) {
    const failures = ruleFailures({ metrics, account, accountSize: startingBalance, phase: account.phase });
    if (failures.length) return { error: json(409, { error: "Rule checks not met", failures }) };
  }

  return { account, metrics, accountSize: startingBalance };
}

function ruleFailures({ metrics, account, accountSize, phase }) {
  const maxDailyLossPct = account.max_daily_loss_pct ?? DEFAULTS.maxDailyLossPct;
  const maxTotalLossPct = account.max_total_loss_pct ?? DEFAULTS.maxTotalLossPct;
  const minTradingDays  = account.min_trading_days   ?? DEFAULTS.minTradingDays;
  const maxBestDayBps   = DEFAULTS.maxBestDayBps;
  const targetPct = phase === "phase_1" ? DEFAULTS.phase1TargetPct : phase === "phase_2" ? DEFAULTS.phase2TargetPct : 0;

  const f = [];
  if (targetPct > 0) {
    const need = accountSize * targetPct / 100;
    if (metrics.grossProfitUsdc < need) f.push(`Profit target: $${metrics.grossProfitUsdc.toFixed(2)} < $${need.toFixed(2)}`);
  } else if (metrics.grossProfitUsdc <= 0) {
    f.push("No profit recorded");
  }
  if (metrics.worstDailyLossBps > maxDailyLossPct * 100) f.push(`Daily loss ${(metrics.worstDailyLossBps/100).toFixed(2)}% > ${maxDailyLossPct}%`);
  if (metrics.maxDrawdownBps   > maxTotalLossPct * 100)  f.push(`Total loss ${(metrics.maxDrawdownBps/100).toFixed(2)}% > ${maxTotalLossPct}%`);
  if (metrics.tradingDaysCount < minTradingDays)         f.push(`Trading days ${metrics.tradingDaysCount} < ${minTradingDays}`);
  if (metrics.grossProfitUsdc > 0 && metrics.bestDayBps > maxBestDayBps) f.push(`Best day ${(metrics.bestDayBps/100).toFixed(1)}% > ${maxBestDayBps/100}%`);
  return f;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// Phase 1 → Phase 2
async function handlePhase2Proof({ payload, supabase, base44 }) {
  const freshId = payload?.phase2AccountId;
  if (!freshId || String(freshId).length !== 24) return json(400, { error: "phase2AccountId must be a 24-char id" });

  const p = await prepare({ payload, supabase, base44, action: "phase2", expectedPhase: "phase_1", gateRules: true });
  if (p.error) return p.error;

  const dl = deadline();
  const hash = registrationHash({
    trader: p.account.trader_address, fromAccountId: p.account.account_id || p.account.id,
    freshAccountId: freshId, freshSize: p.accountSize, dl, chainId: payload.chainId,
  });
  const signatures = await signHash(hash, payload.chainId);
  return json(200, { deadline: dl.toString(), signatures, accountSize: p.accountSize, metrics: p.metrics });
}

// Phase 2 → Funded
async function handleFundedProof({ payload, supabase, base44 }) {
  const freshId = payload?.fundedAccountId || payload?.freshAccountId;
  if (!freshId || String(freshId).length !== 24) return json(400, { error: "fundedAccountId must be a 24-char id" });

  const p = await prepare({ payload, supabase, base44, action: "funded", expectedPhase: "phase_2", gateRules: true });
  if (p.error) return p.error;

  const dl = deadline();
  const hash = registrationHash({
    trader: p.account.trader_address, fromAccountId: p.account.account_id || p.account.id,
    freshAccountId: freshId, freshSize: p.accountSize, dl, chainId: payload.chainId,
  });
  const signatures = await signHash(hash, payload.chainId);
  return json(200, { deadline: dl.toString(), signatures, accountSize: p.accountSize, metrics: p.metrics });
}

// Funded → payout. Contract enforces the rules; we recompute metrics + screen OFAC.
async function handlePayoutProof({ payload, supabase, base44 }) {
  const payoutId = payload?.payoutId;
  if (!payoutId) return json(400, { error: "Missing payoutId" });

  const p = await prepare({ payload, supabase, base44, action: "payout", expectedPhase: "funded", gateRules: false });
  if (p.error) return p.error;

  if (await isAddressSanctioned(p.account.trader_address)) {
    return json(403, { error: "Address is sanctioned — payout denied" });
  }

  const dl = deadline();
  const hash = payoutHash({ trader: p.account.trader_address, accountId: p.account.account_id || p.account.id, m: p.metrics, payoutId, dl, chainId: payload.chainId });
  const signatures = await signHash(hash, payload.chainId);
  return json(200, {
    grossProfitUsdc:   p.metrics.grossProfitUsdc,
    worstDailyLossBps: p.metrics.worstDailyLossBps,
    maxDrawdownBps:    p.metrics.maxDrawdownBps,
    tradingDaysCount:  p.metrics.tradingDaysCount,
    bestDayBps:        p.metrics.bestDayBps,
    payoutId,
    deadline:          dl.toString(),
    signatures,
  });
}

// Post-payout: register a fresh funded account after a payout settles the old
// one. Same registration hash as registerFunded; no rule gating (the account
// already earned funded status). The trader submits registerPostPayout.
async function handlePostPayoutProof({ payload, supabase, base44 }) {
  const freshId = payload?.freshAccountId;
  if (!freshId || String(freshId).length !== 24) return json(400, { error: "freshAccountId must be a 24-char id" });

  const p = await prepare({ payload, supabase, base44, action: "post-payout", expectedPhase: "funded", gateRules: false });
  if (p.error) return p.error;

  const dl = deadline();
  const hash = registrationHash({
    trader: p.account.trader_address, fromAccountId: p.account.account_id || p.account.id,
    freshAccountId: freshId, freshSize: p.accountSize, dl, chainId: payload.chainId,
  });
  const signatures = await signHash(hash, payload.chainId);
  return json(200, { deadline: dl.toString(), signatures, accountSize: p.accountSize });
}

module.exports = {
  handlePhase2Proof,
  handleFundedProof,
  handlePayoutProof,
  handlePostPayoutProof,
  // exported for tests / frontend message parity
  buildClaimAuthMessage,
  registrationHash,
  payoutHash,
  signHash,
  ruleFailures,
  _signerAddresses: (chainId) => chains.signerAddresses(chainId),
};
