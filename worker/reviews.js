"use strict";

/**
 * worker/reviews.js — native, on-chain-verified trader reviews.
 * See docs/reviews-spec.md. All writes flow through here (service-role Supabase);
 * the frontend never writes reviews directly.
 *
 * Verification (no contract deployed):
 *   - account tier: the signer owns a real challenge account (challenge_accounts,
 *     which only exists because it was registered on-chain).
 *   - payout tier  : the signer also has ≥1 settled payout → gold badge.
 *   - every review is wallet-signed (EIP-191) and stored with its content hash,
 *     so anyone can re-verify the visible text against the signature.
 */

const { ethers } = require("ethers");
const adminWallet = require("./adminWallet"); // exposes requireAdmin via community token

const MAX_TITLE = 90;
const MAX_BODY = 1500;
const ISSUED_WINDOW_MS = 10 * 60 * 1000; // signature freshness

// Canonical payload — MUST match src/lib/reviews.js exactly (byte-for-byte).
// Note: the signature commits to the text only. Account ownership and payout
// are proven independently (and trustlessly) from on-chain reads, so they are
// deliberately NOT part of the signed message.
function canonical({ trader, rating, title, body, nonce, issued }) {
  return [
    "ChainFunded Review v1",
    `trader: ${String(trader).toLowerCase()}`,
    `rating: ${rating}`,
    `title: ${title}`,
    `body: ${body}`,
    `nonce: ${nonce}`,
    `issued: ${issued}`,
  ].join("\n");
}

function clean(s, max) {
  return String(s ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// display name: ENS › community handle › truncated wallet
async function resolveDisplayName(address, supabase) {
  // 1. ENS (reverse) — best-effort; only resolves on mainnet RPC.
  try {
    if (process.env.RPC_URL) {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const ens = await provider.lookupAddress(ethers.getAddress(address));
      if (ens) return ens;
    }
  } catch { /* ignore */ }
  // 2. community handle
  try {
    const { data } = await supabase
      .from("community_profiles")
      .select("handle")
      .eq("wallet_address", address)
      .maybeSingle();
    if (data?.handle) return `@${data.handle}`;
  } catch { /* ignore */ }
  // 3. truncated wallet
  return short(address);
}

// Verify the signer owns the account (and capture funded size). The mirror is
// authoritative at runtime and only exists for on-chain-registered accounts.
// NB: challenge_accounts.trader_address is stored CHECKSUMMED, so match it
// case-insensitively (ilike) — the signer we recover is lowercased.
async function verifyOwnership(address, accountId, supabase) {
  let q = supabase.from("challenge_accounts").select("account_id, id, account_size, trader_address");
  q = accountId ? q.or(`account_id.eq.${accountId},id.eq.${accountId}`) : q.order("account_size", { ascending: false });
  const { data } = await q.ilike("trader_address", address).limit(1);
  const acc = Array.isArray(data) ? data[0] : null;
  if (!acc) return null;
  return { accountId: acc.account_id || acc.id, accountSize: Number(acc.account_size) || null };
}

// Settled payouts → gold tier. We surface the most recent payout's id (the
// on-chain replay-protection key, settledPayouts[payoutId]) and tx hash so the
// client can verify the payout directly against the contract.
async function payoutFacts(address, supabase) {
  const { data } = await supabase
    .from("payouts")
    .select("id, trader_share_usdc, tx_hash, created_at")
    .ilike("trader_address", address)
    .eq("status", "settled")
    .not("tx_hash", "is", null)
    .order("created_at", { ascending: false });
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return null;
  return {
    total: rows.reduce((s, r) => s + (Number(r.trader_share_usdc) || 0), 0),
    txHash: rows[0].tx_hash,
    payoutId: rows[0].id != null ? String(rows[0].id) : null,
  };
}

// ── POST /reviews/submit (wallet-signed) ─────────────────────────────────────
async function handleReviewSubmit({ payload, supabase }) {
  const { rating, accountId, nonce, issued, signature } = payload || {};
  const title = clean(payload?.title, MAX_TITLE);
  const body = clean(payload?.body, MAX_BODY);
  const r = Number(rating);

  if (!Number.isInteger(r) || r < 1 || r > 5) return { status: 400, body: { error: "Rating must be 1–5" } };
  if (!title) return { status: 400, body: { error: "A short title is required" } };
  if (!body) return { status: 400, body: { error: "A review is required" } };
  if (!signature || !nonce || !issued) return { status: 400, body: { error: "Missing signature" } };
  if (Math.abs(Date.now() - Number(issued)) > ISSUED_WINDOW_MS) return { status: 400, body: { error: "Signature expired — please sign again" } };

  // Recover the signer from the canonical payload.
  let signer;
  try {
    signer = ethers.verifyMessage(
      canonical({ trader: payload.trader || "", rating: r, title, body, nonce, issued }),
      signature
    ).toLowerCase();
  } catch {
    return { status: 401, body: { error: "Invalid signature" } };
  }
  if (payload.trader && payload.trader.toLowerCase() !== signer) {
    return { status: 401, body: { error: "Signature does not match the connected wallet" } };
  }

  // Ownership (account tier) — required.
  const owned = await verifyOwnership(signer, accountId, supabase);
  if (!owned) return { status: 403, body: { error: "Only funded traders can leave a review. No challenge account found for this wallet." } };

  // Payout (gold tier) — optional.
  const payout = await payoutFacts(signer, supabase);
  const display_name = await resolveDisplayName(signer, supabase);
  const content_hash = ethers.keccak256(ethers.toUtf8Bytes(
    canonical({ trader: signer, rating: r, title, body, nonce, issued })
  ));

  const row = {
    trader_address: signer,
    account_id: owned.accountId,   // on-chain accountId → getChallenge() proof
    rating: r,
    title,
    body,
    display_name,
    verification: payout ? "payout" : "account",
    account_size: owned.accountSize,
    payout_total_usdc: payout ? payout.total : null,
    payout_tx_hash: payout ? payout.txHash : null,
    payout_id: payout ? payout.payoutId : null,   // settledPayouts[payoutId] proof
    nonce: String(nonce),
    issued: Number(issued),
    signature,
    content_hash,
    status: "published",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("reviews")
    .upsert(row, { onConflict: "trader_address" })
    .select()
    .maybeSingle();
  if (error) {
    console.error("[reviews] submit failed:", error.message);
    return { status: 500, body: { error: "Could not save your review" } };
  }
  return { status: 200, body: { review: publicShape(data) } };
}

// ── POST /reviews/list (public read) ─────────────────────────────────────────
async function handleReviewList({ payload, supabase }) {
  const { featured, sort, rating } = payload || {};
  let q = supabase.from("reviews").select("*").eq("status", "published");
  if (featured) q = q.eq("featured", true).order("featured_rank", { ascending: true, nullsFirst: false });
  else if (sort === "highest") q = q.order("rating", { ascending: false }).order("created_at", { ascending: false });
  else if (sort === "payout") q = q.order("verification", { ascending: false }).order("created_at", { ascending: false });
  else q = q.order("created_at", { ascending: false });
  if (rating) q = q.eq("rating", Number(rating));
  q = q.limit(featured ? 12 : 200);

  const { data, error } = await q;
  if (error) return { status: 500, body: { error: "Could not load reviews" } };
  const reviews = (data || []).map(publicShape);

  // Aggregate across all published (not just this filter).
  const { data: all } = await supabase.from("reviews").select("rating, verification").eq("status", "published");
  const ratings = (all || []).map((x) => x.rating);
  const aggregate = {
    count: ratings.length,
    average: ratings.length ? +(ratings.reduce((s, n) => s + n, 0) / ratings.length).toFixed(2) : 0,
    payoutVerified: (all || []).filter((x) => x.verification === "payout").length,
  };
  return { status: 200, body: { reviews, aggregate } };
}

// ── POST /reviews/flag (rate-limited) ────────────────────────────────────────
async function handleReviewFlag({ payload, supabase }) {
  const id = String(payload?.id || "");
  const reason = clean(payload?.reason, 280);
  if (!id) return { status: 400, body: { error: "Missing review id" } };
  await supabase.from("reviews").update({ status: "flagged", flagged_reason: reason || "reported" }).eq("id", id).eq("status", "published");
  return { status: 200, body: { ok: true } };
}

// ── Admin (community-token + admin address) ──────────────────────────────────
async function handleReviewFeature({ payload, supabase }) {
  const auth = adminWallet.requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const id = String(payload?.id || "");
  if (!id) return { status: 400, body: { error: "Missing review id" } };
  const update = { featured: !!payload.featured };
  if (payload.featured_rank !== undefined) update.featured_rank = payload.featured_rank === null ? null : Number(payload.featured_rank);
  const { error } = await supabase.from("reviews").update(update).eq("id", id);
  return error ? { status: 500, body: { error: error.message } } : { status: 200, body: { ok: true } };
}

async function handleReviewHide({ payload, supabase }) {
  const auth = adminWallet.requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const id = String(payload?.id || "");
  if (!id) return { status: 400, body: { error: "Missing review id" } };
  const status = payload.hidden ? "hidden" : "published";
  const { error } = await supabase.from("reviews").update({ status, flagged_reason: payload.reason || null }).eq("id", id);
  return error ? { status: 500, body: { error: error.message } } : { status: 200, body: { ok: true } };
}

async function handleReviewQueue({ payload, supabase }) {
  const auth = adminWallet.requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const { data } = await supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(500);
  return { status: 200, body: { reviews: (data || []) } };
}

// Strip nothing sensitive (reviews are public), but normalise the shape.
function publicShape(r) {
  if (!r) return null;
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    displayName: r.display_name,
    verification: r.verification,
    accountId: r.account_id,
    accountSize: r.account_size,
    payoutTotalUsdc: r.payout_total_usdc,
    payoutTxHash: r.payout_tx_hash,
    payoutId: r.payout_id,
    traderAddress: r.trader_address,
    // Everything below lets anyone re-verify the signature + on-chain facts.
    nonce: r.nonce,
    issued: r.issued,
    signature: r.signature,
    contentHash: r.content_hash,
    featured: r.featured,
    featuredRank: r.featured_rank,
    status: r.status,
    createdAt: r.created_at,
  };
}

module.exports = {
  handleReviewSubmit,
  handleReviewList,
  handleReviewFlag,
  handleReviewFeature,
  handleReviewHide,
  handleReviewQueue,
  canonical,
};
