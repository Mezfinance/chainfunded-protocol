/**
 * Terms acceptance persistence via Base44.
 *
 * Records every acceptance event (TOS Section 22) as a TermsAcceptance entity
 * with: wallet address, terms version hash, variant, timestamp, and user agent.
 * Also provides a lookup to check if a wallet has previously accepted.
 *
 * Fire-and-forget writes — never blocks the UI or throws to the caller.
 */

import { base44 } from "@/api/base44Client";

/**
 * Record a terms acceptance event to Base44.
 *
 * @param {Object} params
 * @param {string} params.walletAddress  - Wallet that accepted
 * @param {string} params.termsVersion   - SHA-256 hash of the terms document
 * @param {string} params.variant        - 'standard' | 'whitelist'
 * @param {string} [params.txHash]       - On-chain tx hash (if available)
 */
export async function recordTermsAcceptance({ walletAddress, termsVersion, variant = "standard", txHash = null }) {
  try {
    await base44.entities.TermsAcceptance.create({
      wallet_address: walletAddress.toLowerCase(),
      terms_version:  termsVersion,
      variant,
      accepted_at:    new Date().toISOString(),
      user_agent:     navigator.userAgent,
      tx_hash:        txHash || "",
    });
  } catch (err) {
    console.error("[recordTermsAcceptance] Base44 error:", err.message);
  }
}

/**
 * Check if a wallet has accepted any version of terms.
 *
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */
export async function hasAcceptedTerms(walletAddress) {
  try {
    const records = await base44.entities.TermsAcceptance.filter({
      wallet_address: walletAddress.toLowerCase(),
    });
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}
