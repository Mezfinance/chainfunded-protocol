import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useActiveAccount } from "thirdweb/react";
import { communityApi } from "@/lib/communityApi";

const STORAGE_KEY = "cf_community_jwt";
const REFRESH_BUFFER_MS = 60 * 1000;          // treat as expired ~1 min early
// Silently refresh once the token is older than ~10 days (i.e. <80d left),
// so any active user perpetually rolls forward without re-signing.
const REFRESH_WHEN_REMAINING_MS = 80 * 24 * 60 * 60 * 1000;

/**
 * Sign-once community session. The wallet signs a single login message; the
 * worker verifies it (EOA or smart-wallet EIP-1271) and returns a 7-day JWT
 * that's cached in localStorage and attached to every write. No per-action
 * signature prompt — you only sign again once the JWT expires.
 *
 * `token` is the shape spread into request bodies: `{ token: <jwt> }`.
 * Shape { token, signIn, signOut, signing } is preserved for existing callers.
 */
function loadSession(address) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.address?.toLowerCase() !== address?.toLowerCase()) return null;
    if (!s.exp || s.exp - REFRESH_BUFFER_MS < Date.now()) return null;
    return s; // { address, jwt, exp }
  } catch {
    return null;
  }
}

function saveSession(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function useCommunityToken() {
  const { address } = useAuth();
  const account = useActiveAccount();
  const [session, setSession] = useState(() => (address ? loadSession(address) : null));
  const [signing, setSigning] = useState(false);
  const refreshingRef = useRef(false);

  // Re-load (or drop) the cached session when the wallet changes.
  useEffect(() => {
    setSession(address ? loadSession(address) : null);
  }, [address]);

  // Sliding refresh: roll a still-valid-but-aging JWT forward without a
  // signature prompt, so active users effectively never re-sign.
  useEffect(() => {
    if (!session?.jwt) return;
    if (session.exp - Date.now() >= REFRESH_WHEN_REMAINING_MS) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { jwt, exp } = await communityApi.authRefresh(session.jwt);
        if (cancelled || !jwt) return;
        const next = { address: session.address, jwt, exp };
        saveSession(next);
        setSession(next);
      } catch { /* keep the existing token; it's still valid */ }
      finally { refreshingRef.current = false; }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const signIn = useCallback(async () => {
    if (!account || !address) throw new Error("Connect a wallet first");
    if (signing) return null;

    // Reuse a still-valid cached session rather than prompting again.
    const cached = loadSession(address);
    if (cached) { setSession(cached); return { token: cached.jwt }; }

    setSigning(true);
    try {
      const { message } = await communityApi.authChallenge(address);
      const signature = await account.signMessage({ message });
      const { jwt, exp } = await communityApi.authLogin({ address, message, signature });
      if (!jwt) throw new Error("Login failed");
      const next = { address: address.toLowerCase(), jwt, exp };
      saveSession(next);
      setSession(next);
      return { token: jwt };
    } finally {
      setSigning(false);
    }
  }, [account, address, signing]);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const token = session ? { token: session.jwt } : null;
  return { token, signIn, signOut, signing };
}
