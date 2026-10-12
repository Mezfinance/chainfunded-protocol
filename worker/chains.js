"use strict";

/**
 * chains — per-network config for the claim oracle.
 *
 * The worker signs proofs whose hash binds chainId + pool address, and finalize
 * reads getChallenge from the matching RPC. To let ONE worker serve mainnet
 * (prod) and Sepolia (testing) — the way the single worker has always been used
 * — config is keyed by chainId and resolved per request from the frontend's
 * chainId. Mainnet signing is unaffected when a Sepolia request comes in.
 *
 * ENV
 *   mainnet (1):        REWARDS_POOL_ADDRESS, RPC_URL, PAYOUT_SIGNER_KEYS
 *   sepolia (11155111): SEPOLIA_REWARDS_POOL_ADDRESS, SEPOLIA_RPC_URL,
 *                       SEPOLIA_PAYOUT_SIGNER_KEYS (falls back to
 *                       PAYOUT_SIGNER_KEYS if the same signer set is authorized
 *                       on both contracts)
 *   CHAIN_ID — the default chainId when a request omits one (back-compat).
 */

const { ethers } = require("ethers");

function firstEnv(names) {
  for (const n of names) { const v = process.env[n]; if (v && v.trim()) return v.trim(); }
  return "";
}

function parseKeys(raw) {
  return (raw || "")
    .split(",").map((s) => s.trim().replace(/^['"]+/, "").replace(/['"]+$/, "")).filter(Boolean)
    .map((k) => (k.startsWith("0x") ? k : "0x" + k));
}

function loadChain(id, { poolVars, rpcVars, keysVars }) {
  const poolRaw = firstEnv(poolVars);
  const rpc     = firstEnv(rpcVars);
  let pool = "";
  try { pool = poolRaw ? ethers.getAddress(poolRaw) : ""; }
  catch (e) { console.error(`[chains] chain ${id}: invalid pool address ${poolRaw}: ${e.message}`); }

  const wallets = [];
  for (const k of parseKeys(firstEnv(keysVars))) {
    try { wallets.push(new ethers.Wallet(k)); }
    catch (e) { console.error(`[chains] chain ${id}: invalid signer key: ${e.message}`); }
  }

  if (!pool || wallets.length === 0) return null;
  return { chainId: BigInt(id), pool, rpc, wallets, _provider: null };
}

const CHAINS = {};
const _mainnet = loadChain(1, {
  poolVars: ["REWARDS_POOL_ADDRESS", "VITE_REWARDS_POOL_ADDRESS", "CHAINFUNDED_POOL_ADDRESS"],
  rpcVars:  ["RPC_URL"],
  keysVars: ["PAYOUT_SIGNER_KEYS"],
});
if (_mainnet) CHAINS["1"] = _mainnet;

const _sepolia = loadChain(11155111, {
  poolVars: ["SEPOLIA_REWARDS_POOL_ADDRESS", "VITE_SEPOLIA_REWARDS_POOL_ADDRESS"],
  rpcVars:  ["SEPOLIA_RPC_URL"],
  keysVars: ["SEPOLIA_PAYOUT_SIGNER_KEYS", "PAYOUT_SIGNER_KEYS"],
});
if (_sepolia) CHAINS["11155111"] = _sepolia;

const DEFAULT_CHAIN_ID = String(process.env.CHAIN_ID || "1");

function getChain(chainId) {
  const id = String(chainId || DEFAULT_CHAIN_ID);
  return CHAINS[id] || null;
}

function provider(chain) {
  if (!chain || !chain.rpc) return null;
  if (!chain._provider) chain._provider = new ethers.JsonRpcProvider(chain.rpc);
  return chain._provider;
}

function signerAddresses(chainId) {
  const c = getChain(chainId);
  return c ? c.wallets.map((w) => w.address) : [];
}

function logChains() {
  const ids = Object.keys(CHAINS);
  if (ids.length === 0) { console.warn("[chains] No chains configured — claim endpoints will 503."); return; }
  for (const id of ids) {
    const c = CHAINS[id];
    console.log(`[chains] chain ${id}: pool ${c.pool}, ${c.wallets.length} signer(s) [${c.wallets.map(w=>w.address).join(", ")}], rpc ${c.rpc ? "set" : "UNSET"}`);
  }
  console.log(`[chains] default chainId = ${DEFAULT_CHAIN_ID}`);
}

module.exports = { getChain, provider, signerAddresses, logChains, DEFAULT_CHAIN_ID, CHAINS };
