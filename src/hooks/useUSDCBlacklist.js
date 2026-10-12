import { useState, useEffect, useCallback } from 'react';
import { readContract, getContract } from 'thirdweb';
import { thirdwebClient, chain } from '@/lib/thirdwebClient';

/**
 * USDC Blacklist Check Hook
 *
 * Circle's USDC contract has a built-in blacklist. When an address is
 * blacklisted, all USDC transfers to/from that address revert.
 *
 * This hook checks whether a wallet is blacklisted BEFORE attempting
 * a payout, so we can show a clear error instead of a confusing
 * transaction revert.
 *
 * USDC uses the FiatTokenV2_1 contract which has:
 *   - function isBlacklisted(address _account) view returns (bool)
 *
 * On testnet (Sepolia), the mock USDC may not have this function.
 * In that case we fail open (assume not blacklisted).
 */

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;

/**
 * Check if an address is blacklisted on the USDC contract.
 * Returns: true (blacklisted), false (clean), or null (check unavailable).
 */
export async function checkUSDCBlacklist(address) {
  if (!USDC_ADDRESS || !address) return null;

  try {
    const usdc = getContract({
      client: thirdwebClient,
      chain,
      address: USDC_ADDRESS,
    });

    const result = await readContract({
      contract: usdc,
      method: 'function isBlacklisted(address _account) view returns (bool)',
      params: [address],
    });

    return result;
  } catch (err) {
    // isBlacklisted may not exist on testnet mock USDC — fail open
    console.warn('[USDC] Blacklist check unavailable:', err.message);
    return null;
  }
}

/**
 * React hook version — checks on mount and when address changes.
 */
export function useUSDCBlacklist(address) {
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const check = useCallback(async (addr) => {
    if (!addr) {
      setIsBlacklisted(false);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    const result = await checkUSDCBlacklist(addr);
    setIsBlacklisted(result === true);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    check(address);
  }, [address, check]);

  return { isBlacklisted, isChecking };
}
