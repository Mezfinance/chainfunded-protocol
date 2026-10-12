/**
 * AuthContext — Authentication provider for wallet-based auth.
 *
 * Wraps the app to provide auth state: connected wallet address, connection
 * status, admin role check (against VITE_ADMIN_ADDRESSES), and OFAC sanctions
 * screening. Uses Thirdweb SDK for wallet connection state.
 *
 * Exports:
 *   - AuthProvider: context provider component
 *   - useAuth(): hook returning { address, isConnected, isAdmin, isSanctioned, ... }
 */
import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { useActiveAccount, useActiveWalletConnectionStatus } from 'thirdweb/react';
import { useOFACScreening } from '@/hooks/useOFACScreening';
import { trackConversion } from '@/lib/xpixel';

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

// Wallets that are always admins, regardless of VITE_ADMIN_ADDRESSES.
const BUILTIN_ADMIN_ADDRESSES = [
  '0x7d6fa8b8f5bb3342022e7517872665cb71539366',
];

const ADMIN_ADDRESSES = [
  ...BUILTIN_ADMIN_ADDRESSES,
  ...(import.meta.env.VITE_ADMIN_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
];

const WALLET_SEEN_KEY = 'cf_wallet_seen';

const AuthContext = createContext();

// ─── Mock provider (screenshots mode only) ───────────────────────────────────

const MockAuthProvider = ({ children }) => {
  const isDisconnected =
    typeof window !== 'undefined' &&
    localStorage.getItem('screenshots_auth') === 'disconnected';
  const mockAddress = isDisconnected ? null : '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9012';
  return (
    <AuthContext.Provider
      value={{
        user: mockAddress ? { address: mockAddress, role: 'user' } : null,
        address: mockAddress,
        isAuthenticated: !!mockAddress,
        isAdmin: false,
        isLoadingAuth: false,
        isLoadingPublicSettings: false,
        authError: null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Real provider ────────────────────────────────────────────────────────────

const RealAuthProvider = ({ children }) => {
  const account          = useActiveAccount();
  const connectionStatus = useActiveWalletConnectionStatus();

  const address         = account?.address ?? null;
  const isAuthenticated = !!address;
  const isAdmin         = !!address && ADMIN_ADDRESSES.includes(address.toLowerCase());

  // OFAC sanctions screening — mirrors Uniswap Labs frontend approach
  const { isSanctioned, isChecking: isCheckingOFAC } = useOFACScreening(address);

  // isLoadingAuth state machine
  //
  // thirdweb can pulse through 'disconnected' at several points:
  //   - During OAuth redirect (page reload after social login)
  //   - During session re-validation after navigation
  //   - When 'connecting' → briefly 'disconnected' → 'connected'
  //   - When connectionStatus='connected' but account object hasn't resolved yet
  //
  // Rules:
  //   'unknown'     → loading (thirdweb hasn't checked storage yet)
  //   'connecting'  → loading + SET the localStorage flag (thirdweb has stored creds)
  //   'connected' + no account yet → loading (account object still resolving)
  //   'connected' + account present → done loading, set flag
  //   'disconnected' + flag set → loading + 3 s grace (reconnect window)
  //   'disconnected' + no flag   → done loading (genuine new visitor)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const walletSeenRef = useRef(localStorage.getItem(WALLET_SEEN_KEY) === '1');
  const graceTimer    = useRef(null);

  useEffect(() => {
    clearTimeout(graceTimer.current);

    if (connectionStatus === 'connecting') {
      // Thirdweb is actively reconnecting from stored credentials.
      // Set the flag NOW so any brief 'disconnected' pulse that follows
      // will get a grace period instead of resolving immediately.
      localStorage.setItem(WALLET_SEEN_KEY, '1');
      walletSeenRef.current = true;
      setIsLoadingAuth(true);
      return;
    }

    if (connectionStatus === 'unknown') {
      setIsLoadingAuth(true);
      return;
    }

    if (connectionStatus === 'connected') {
      if (!account) {
        // Status flipped to connected but the account object hasn't resolved yet.
        // Stay in loading to avoid a flash of isAuthenticated=false.
        setIsLoadingAuth(true);
        return;
      }
      localStorage.setItem(WALLET_SEEN_KEY, '1');
      walletSeenRef.current = true;
      setIsLoadingAuth(false);
      return;
    }

    // 'disconnected'
    if (walletSeenRef.current) {
      // Previously connected — give thirdweb 3 s to finish reconnecting.
      setIsLoadingAuth(true);
      graceTimer.current = setTimeout(() => {
        localStorage.removeItem(WALLET_SEEN_KEY);
        walletSeenRef.current = false;
        setIsLoadingAuth(false);
      }, 3000);
    } else {
      // Genuine new visitor with no prior session.
      setIsLoadingAuth(false);
    }

    return () => clearTimeout(graceTimer.current);
  }, [connectionStatus, account]); // account in deps catches the connected-but-no-account case

  // X conversion: wallet-connect as a mid-funnel Lead. Fire once per wallet
  // per browser session so reloads / re-renders don't re-count.
  useEffect(() => {
    if (!address) return;
    const key = `cf_x_lead_${address.toLowerCase()}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* ignore */ }
    trackConversion('lead', {});
  }, [address]);

  const user = address
    ? { address, role: isAdmin ? 'admin' : 'user' }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        address,
        isAuthenticated,
        isAdmin,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError: null,
        isSanctioned,
        isCheckingOFAC,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider = IS_SCREENSHOTS ? MockAuthProvider : RealAuthProvider;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
