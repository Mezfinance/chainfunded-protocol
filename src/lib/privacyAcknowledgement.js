/**
 * Privacy Policy update acknowledgement.
 *
 * When the Privacy Policy is materially updated we ask returning visitors to
 * confirm they've seen the new version (one-time, per policy version). The
 * acknowledgement is logged to the same Base44 acceptance table the Terms gate
 * uses, tagged variant 'privacy_policy' and stamped with the policy version
 * (its "Last Updated" date) and wallet address.
 *
 * Bump PRIVACY_POLICY_VERSION whenever the policy changes materially — that
 * re-arms the notice for everyone.
 */
import { base44 } from "@/api/base44Client";

export const PRIVACY_POLICY_VERSION = "2026-06-05"; // matches the "Last Updated" date

const ACK_KEY = "cf_privacy_ack";         // stores the acknowledged version
const WALLET_SEEN_KEY = "cf_wallet_seen"; // set by AuthContext for prior users

export function getAcknowledgedVersion() {
  try { return localStorage.getItem(ACK_KEY); } catch { return null; }
}

export function setAcknowledgedVersion(version = PRIVACY_POLICY_VERSION) {
  try { localStorage.setItem(ACK_KEY, version); } catch { /* ignore */ }
}

/** True if this browser belongs to a returning visitor (used the site before). */
export function isReturningVisitor() {
  try { return localStorage.getItem(WALLET_SEEN_KEY) === "1"; } catch { return false; }
}

/**
 * Whether to show the update notice: a returning visitor who hasn't yet
 * acknowledged the current policy version. Brand-new visitors implicitly
 * accept the current policy and are not prompted.
 */
export function needsPrivacyAck({ returning } = {}) {
  const isReturning = returning ?? isReturningVisitor();
  return Boolean(isReturning) && getAcknowledgedVersion() !== PRIVACY_POLICY_VERSION;
}

/**
 * Persist the acknowledgement to the DB. Fire-and-forget — never blocks the UI
 * or throws to the caller, mirroring recordTermsAcceptance.
 */
export async function recordPrivacyAck({ walletAddress = null, version = PRIVACY_POLICY_VERSION } = {}) {
  try {
    await base44.entities.TermsAcceptance.create({
      wallet_address: walletAddress ? walletAddress.toLowerCase() : "",
      terms_version:  version,
      variant:        "privacy_policy",
      accepted_at:    new Date().toISOString(),
      user_agent:     typeof navigator !== "undefined" ? navigator.userAgent : "",
      tx_hash:        "",
    });
  } catch (err) {
    console.error("[recordPrivacyAck] Base44 error:", err.message);
  }
}
