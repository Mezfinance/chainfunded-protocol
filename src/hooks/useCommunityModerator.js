import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { communityApi } from "@/lib/communityApi";

/**
 * Returns whether the connected wallet is a community moderator.
 * Admins (per VITE_ADMIN_ADDRESSES) implicitly have mod powers, so this
 * resolves to true for them without checking the database.
 */
export function useCommunityModerator() {
  const { address, isAdmin } = useAuth();
  const [isMod, setIsMod] = useState(false);

  useEffect(() => {
    if (!address) { setIsMod(false); return; }
    if (isAdmin) { setIsMod(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const { moderators } = await communityApi.listModerators();
        if (cancelled) return;
        const me = address.toLowerCase();
        setIsMod((moderators || []).some((m) => m.wallet_address?.toLowerCase() === me));
      } catch {
        if (!cancelled) setIsMod(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address, isAdmin]);

  return { isMod, isAdmin };
}
