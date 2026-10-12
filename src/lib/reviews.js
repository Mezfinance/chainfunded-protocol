// Reviews client — talks to the worker reviews endpoints. The frontend never
// writes reviews directly; submit is wallet-signed and verified server-side.
// See docs/reviews-spec.md.
import { ethers } from "ethers";
import { workerPost } from "@/lib/workerApi";

export const REVIEW_MAX_TITLE = 90;
export const REVIEW_MAX_BODY = 1500;

// Canonical signed payload — MUST match worker/reviews.js byte-for-byte.
// The signature commits to the review text only; account ownership and payouts
// are proven separately (and trustlessly) from on-chain reads.
export function canonicalReview({ trader, rating, title, body, nonce, issued }) {
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

/**
 * Re-verify a published review's signature entirely client-side — no trust in
 * our server required. Recovers the signer from the displayed text and checks
 * it matches the claimed wallet, and that the content hash matches.
 * Returns { ok, signatureOk, hashOk, signer }.
 */
export function verifyReviewSignature(review) {
  const out = { ok: false, signatureOk: false, hashOk: false, signer: null };
  try {
    const message = canonicalReview({
      trader: review.traderAddress,
      rating: review.rating,
      title: review.title,
      body: review.body,
      nonce: review.nonce,
      issued: review.issued,
    });
    if (review.signature) {
      const signer = ethers.verifyMessage(message, review.signature).toLowerCase();
      out.signer = signer;
      out.signatureOk = signer === String(review.traderAddress || "").toLowerCase();
    }
    if (review.contentHash) {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(message));
      out.hashOk = hash.toLowerCase() === String(review.contentHash).toLowerCase();
    }
  } catch { /* malformed → stays false */ }
  out.ok = out.signatureOk && (review.contentHash ? out.hashOk : true);
  return out;
}

async function postJson(path, body) {
  const res = await workerPost(path, body);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/** { reviews, aggregate } */
export function fetchReviews(opts = {}) {
  return postJson("/reviews/list", {
    featured: !!opts.featured,
    sort: opts.sort || "newest",
    rating: opts.rating || undefined,
  });
}

/** Sign the review with the connected thirdweb account, then submit. */
export async function signAndSubmitReview({ account, rating, title, body, accountId }) {
  const trader = account.address;
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const issued = Date.now();
  const message = canonicalReview({ trader, rating, title, body, nonce, issued });
  const signature = await account.signMessage({ message });
  const { review } = await postJson("/reviews/submit", { trader, accountId, rating, title, body, nonce, issued, signature });
  // Self-suppress milestone nudges for this wallet now that it has reviewed.
  try { localStorage.setItem(`cf-reviewed-${String(trader).toLowerCase()}`, "1"); } catch { /* ignore */ }
  return review;
}

export function flagReview(id, reason) {
  return postJson("/reviews/flag", { id, reason });
}

// ── formatting helpers ───────────────────────────────────────────────────────
export function formatAccountSize(n) {
  const v = Number(n) || 0;
  return v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v.toLocaleString()}`;
}
export function formatUsd(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}
export function relativeDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
