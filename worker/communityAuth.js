"use strict";

/**
 * worker/communityAuth.js
 *
 * Sign-once session auth for the community + notifications.
 *
 * Flow:
 *   1. Client GETs a login message (POST /community/auth/challenge).
 *   2. The connected wallet signs that message ONCE.
 *   3. Client POSTs { address, message, signature } to /community/auth/login.
 *      The worker verifies the signature — EOA recovery for normal/EIP-7702
 *      wallets, EIP-1271 `isValidSignature` for smart-contract wallets — and
 *      issues an HMAC-signed session JWT valid for 7 days.
 *   4. Every community/notification write carries the JWT as `token`. The
 *      worker just verifies the HMAC (no signature prompt, no RPC).
 *
 * Replaces the old per-request EIP-191 signature, which prompted a wallet
 * signature on every session and couldn't verify smart-wallet signatures.
 */

const crypto = require("crypto");
const { ethers } = require("ethers");

const JWT_SECRET          = process.env.COMMUNITY_JWT_SECRET || "";
const JWT_TTL_MS          = 90 * 24 * 60 * 60 * 1000; // 90 days
const LOGIN_FRESHNESS_MS  = 10 * 60 * 1000;            // signed challenge max age
const DOMAIN              = process.env.COMMUNITY_AUTH_DOMAIN || "chainfunded.io";
const RPC_URL             = process.env.RPC_URL || "";

// ── JWT (compact HS256, no external dep) ──────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(obj) { return b64url(JSON.stringify(obj)); }
function fromB64url(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

function signJwt(claims) {
  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const body = `${head}.${b64urlJson(claims)}`;
  const sig = b64url(crypto.createHmac("sha256", JWT_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifyJwt(token) {
  if (!JWT_SECRET || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(body).digest());
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(fromB64url(parts[1]).toString("utf8")); } catch { return null; }
  if (!claims.sub || !claims.exp || claims.exp < Date.now()) return null;
  return claims;
}

// ── Signature verification ────────────────────────────────────────────────
function buildLoginMessage({ address, issuedAt, nonce }) {
  return [
    `${DOMAIN} wants you to sign in with your wallet.`,
    ``,
    `Address: ${address}`,
    `Issued At: ${issuedAt}`,
    `Nonce: ${nonce}`,
    ``,
    `Signing proves you own this wallet for the ChainFunded community. It does not authorise any transaction or spend any funds.`,
  ].join("\n");
}

const ERC1271_MAGIC = "0x1626ba7e";
const erc1271Iface = new ethers.Interface([
  "function isValidSignature(bytes32 _hash, bytes _signature) view returns (bytes4)",
]);

let _provider;
function getProvider() {
  if (_provider !== undefined) return _provider;
  _provider = RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null;
  return _provider;
}

async function verifySignature({ address, message, signature }) {
  // EOA (incl. EIP-7702 in-app wallets signing with the embedded key).
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() === address.toLowerCase()) return true;
  } catch { /* fall through to 1271 */ }

  // Smart-contract wallet (EIP-1271).
  const provider = getProvider();
  if (provider) {
    try {
      const hash = ethers.hashMessage(message);
      const contract = new ethers.Contract(address, erc1271Iface, provider);
      const res = await contract.isValidSignature(hash, signature);
      if (res === ERC1271_MAGIC) return true;
    } catch { /* not a 1271 wallet or not deployed */ }
  }
  return false;
}

// ── Handlers ──────────────────────────────────────────────────────────────
async function handleAuthChallenge({ payload }) {
  const address = String(payload?.address || "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { status: 400, body: { error: "Invalid wallet address" } };
  }
  const issuedAt = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = buildLoginMessage({ address: address.toLowerCase(), issuedAt, nonce });
  return { status: 200, body: { message } };
}

async function handleAuthLogin({ payload }) {
  if (!JWT_SECRET) {
    return { status: 500, body: { error: "Community auth not configured" } };
  }
  const { address, message, signature } = payload || {};
  if (!address || !message || !signature || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return { status: 400, body: { error: "Missing login fields" } };
  }
  // Message must bind to the claimed address and be recent.
  if (!message.includes(address.toLowerCase()) && !message.includes(address)) {
    return { status: 401, body: { error: "Address mismatch" } };
  }
  const m = /Issued At: (.+)/.exec(message);
  const issued = m ? Date.parse(m[1].trim()) : NaN;
  if (!Number.isFinite(issued) || Date.now() - issued > LOGIN_FRESHNESS_MS || issued - Date.now() > 60_000) {
    return { status: 401, body: { error: "Login challenge expired — please retry" } };
  }
  const ok = await verifySignature({ address, message, signature });
  if (!ok) return { status: 401, body: { error: "Signature verification failed" } };

  const exp = Date.now() + JWT_TTL_MS;
  const jwt = signJwt({ sub: address.toLowerCase(), iat: Date.now(), exp });
  return { status: 200, body: { jwt, exp } };
}

// Sliding refresh — swap a still-valid JWT for a fresh 90-day one with no
// signature prompt. Lets active users stay signed in indefinitely; only
// someone dormant past the full window (or with a tampered/expired token)
// has to sign again.
async function handleAuthRefresh({ payload }) {
  if (!JWT_SECRET) {
    return { status: 500, body: { error: "Community auth not configured" } };
  }
  const claims = verifyJwt(payload?.token);
  if (!claims) return { status: 401, body: { error: "Session expired" } };
  const exp = Date.now() + JWT_TTL_MS;
  const jwt = signJwt({ sub: claims.sub, iat: Date.now(), exp });
  return { status: 200, body: { jwt, exp } };
}

module.exports = { signJwt, verifyJwt, verifySignature, handleAuthChallenge, handleAuthLogin, handleAuthRefresh };
