"use strict";

// Admin endpoint: resolve (or pre-generate) a thirdweb in-app wallet for an
// email address. Same admin auth as the X-bot / moderator endpoints. Requires
// the project SECRET key (server-only) in THIRDWEB_SECRET_KEY.
//
// thirdweb pregenerate is idempotent: the same email always maps to the same
// wallet, so this returns the existing wallet if one is set up, or provisions
// a new one if not. The address is non-custodial — the trader controls it by
// later logging in with that email via the in-app wallet.

const community = require("./community");
function verifyToken(payload) { return community.verifyToken(payload); }

const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES || process.env.VITE_ADMIN_ADDRESSES || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function requireAdmin(payload) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { ok: false, status: 401, error: auth.error };
  if (!ADMIN_ADDRESSES.has(auth.address)) return { ok: false, status: 403, error: "Admin role required" };
  return { ok: true, address: auth.address };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleResolveWallet({ payload }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const email = String(payload?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: "A valid email address is required" } };

  const secret = process.env.THIRDWEB_SECRET_KEY;
  if (!secret) return { status: 503, body: { error: "THIRDWEB_SECRET_KEY is not configured on the worker" } };

  try {
    const res = await fetch("https://api.thirdweb.com/v1/wallets/user", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-secret-key": secret },
      body: JSON.stringify({ type: "email", email }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `thirdweb returned ${res.status}`;
      return { status: 502, body: { error: msg } };
    }
    const address = data?.result?.address;
    if (!address) return { status: 502, body: { error: "thirdweb returned no wallet address" } };
    return { status: 200, body: { address, userId: data.result.userId || null, email } };
  } catch (err) {
    return { status: 502, body: { error: `thirdweb request failed: ${err.message}` } };
  }
}

module.exports = { handleResolveWallet, requireAdmin };
