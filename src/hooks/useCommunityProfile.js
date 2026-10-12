import { useEffect, useState, useCallback } from "react";
import { communityApi } from "@/lib/communityApi";

/**
 * Loads a community profile + verified stats for a given wallet address.
 * Profile fetch is reactive: passing a new `address` re-fetches.
 *
 * Returns:
 *   { profile, loading, error, reload }
 *
 * `profile` shape (when public):
 *   { address, handle, is_private, accounts_active, accounts_total,
 *     max_account_size, max_phase, payout_total_usdc, season_points,
 *     ban_until }
 *
 * When private, only { handle, is_private: true } is returned.
 */
export function useCommunityProfile(address) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!address) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const { profile } = await communityApi.getProfileStats(address);
      setProfile(profile ? { ...profile, address: address.toLowerCase() } : null);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  return { profile, loading, error, reload: load };
}
