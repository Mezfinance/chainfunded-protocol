/**
 * Hook that checks whether a whitelisted (free) account requires
 * terms acceptance before the user can access it.
 *
 * Returns:
 *   - needsTermsAcceptance: true if there are free accounts and terms haven't been accepted
 *   - acceptTerms: function to call when user accepts terms
 *   - filterAccounts: function that filters out gated accounts from an account list
 */
import { useState, useCallback, useEffect } from "react";
import { hasAcceptedTerms } from "@/lib/termsAcceptance";

const STORAGE_KEY = "cf_whitelist_terms_accepted";

function getAcceptedWallets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function isAcceptedLocally(address) {
  if (!address) return false;
  const accepted = getAcceptedWallets();
  return !!accepted[address.toLowerCase()];
}

function markAcceptedLocally(address) {
  if (!address) return;
  const accepted = getAcceptedWallets();
  accepted[address.toLowerCase()] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accepted));
}

export function useWhitelistTermsGate(address, accounts) {
  const [termsAccepted, setTermsAccepted] = useState(() => isAcceptedLocally(address));

  // Re-check when address changes — check localStorage first (instant),
  // then verify against Supabase (async, covers cross-device acceptance).
  useEffect(() => {
    if (isAcceptedLocally(address)) {
      setTermsAccepted(true);
      return;
    }
    if (!address) return;
    // Check Supabase as fallback (user may have accepted on another device)
    hasAcceptedTerms(address, "whitelist").then((accepted) => {
      if (accepted) {
        markAcceptedLocally(address);
        setTermsAccepted(true);
      }
    });
  }, [address]);

  const hasFreeAccounts = accounts.some((a) => a.challenge_fee_usdc === 0);
  const needsTermsAcceptance = hasFreeAccounts && !termsAccepted;

  const acceptTerms = useCallback(() => {
    markAcceptedLocally(address);
    setTermsAccepted(true);
    // Supabase recording is handled by TermsAcceptanceGate component
  }, [address]);

  // Filter out free accounts if terms haven't been accepted
  const filterAccounts = useCallback(
    (accs) => {
      if (termsAccepted) return accs;
      return accs.filter((a) => a.challenge_fee_usdc !== 0);
    },
    [termsAccepted]
  );

  return { needsTermsAcceptance, acceptTerms, filterAccounts };
}
