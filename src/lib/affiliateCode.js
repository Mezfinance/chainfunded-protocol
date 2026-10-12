/**
 * Affiliate code utilities — generate a 10-char obfuscated code from a
 * wallet address, and reverse-lookup a wallet from a code.
 *
 * The code is a SHA-256 hash of the wallet truncated to 10 hex chars.
 * This means observers of the code cannot derive any information about
 * the wallet — unlike a simple prefix which exposes the first N bytes.
 *
 * Lookups work by hashing each candidate wallet and comparing to the
 * code. With ~1 trillion possible 10-char codes, collisions are
 * negligible up to millions of affiliates.
 */

/**
 * Hash a wallet address into a 10-char uppercase hex code.
 * @param {string} address — EVM wallet address (0x...)
 * @returns {Promise<string>} 10-char uppercase hex code
 */
export async function walletToCode(address) {
  if (!address) return "";
  const lower = address.toLowerCase();
  const buf = new TextEncoder().encode(lower);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 10).toUpperCase();
}

/**
 * Find the wallet address whose code matches the given code.
 * Searches a list of candidate addresses (e.g. ChallengeAccount records).
 * @param {string} code — 10-char hex code (case-insensitive)
 * @param {string[]} candidates — array of wallet addresses to check
 * @returns {Promise<string|null>} matching wallet address, or null
 */
export async function findWalletByCode(code, candidates) {
  if (!code || !candidates?.length) return null;
  const target = code.toUpperCase();
  // Hash all candidates in parallel
  const hashes = await Promise.all(
    candidates.map((addr) => addr ? walletToCode(addr) : Promise.resolve(""))
  );
  const idx = hashes.findIndex((h) => h === target);
  return idx >= 0 ? candidates[idx] : null;
}
