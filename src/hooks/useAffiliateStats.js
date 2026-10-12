import { useState, useEffect, useCallback } from "react";
import { getContract, getContractEvents, prepareEvent, readContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { MOCK_AFFILIATE_STATS } from "@/lib/screenshotMocks";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

// ChallengeRegistered emitted by ChainFundedPool.registerChallenge().
// `affiliate` is indexed so we can filter at the RPC level.
const challengeRegisteredEvent = prepareEvent({
  signature:
    "event ChallengeRegistered(address indexed trader, string indexed accountId, uint256 accountSizeUsdc, uint8 phase, uint256 feeAmount, uint256 protocolRevenue, uint256 lpProfitPoolShare, uint256 lpCapitalShare, address indexed affiliate, uint256 affiliateRevenue)",
});

// Persist first-seen timestamps so monthly volume survives page reloads
// without additional RPC calls.
const TS_KEY = "cf_affiliate_tx_timestamps";
function loadTsStore() {
  try { return JSON.parse(localStorage.getItem(TS_KEY) || "{}"); }
  catch { return {}; }
}
function saveTsStore(store) {
  try { localStorage.setItem(TS_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}
function recordNewPayments(payments) {
  const store = loadTsStore();
  let dirty = false;
  const now = Date.now();
  for (const p of payments) {
    if (!store[p.txHash]) {
      store[p.txHash] = now;
      dirty = true;
    }
  }
  if (dirty) saveTsStore(store);
  return loadTsStore();
}

/**
 * Returns affiliate commission stats for a wallet by reading ChallengeRegistered
 * events from ChainFundedPool where affiliate == affiliateAddress.
 *
 * totalCommissionUsdc   — lifetime USDC commissions earned
 * totalReferrals        — unique traders referred (first fee only)
 * monthlyVolumeUsdc     — sum of first-eval fee USDC referred this calendar month
 * payments              — array of { txHash, amountUsdc, feeUsdc, traderAddress, blockNumber, seenAt }
 */
const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

function useAffiliateStatsMock() {
  return { ...MOCK_AFFILIATE_STATS, refetch: () => {} };
}

function useAffiliateStatsReal(affiliateAddress) {
  const [stats, setStats] = useState({
    totalCommissionUsdc: null,
    totalReferrals: null,
    monthlyVolumeUsdc: null,
    currentRateBps: null,       // On-chain tier rate (BPS), e.g. 800 = 8%
    payments: [],
    loading: true,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    if (!affiliateAddress || !POOL_ADDRESS) {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }

    setStats((s) => ({ ...s, loading: true, error: null }));

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      const events = await getContractEvents({
        contract: pool,
        events: [challengeRegisteredEvent],
        filters: { affiliate: affiliateAddress },
      }).catch(() => []);

      const affiliateLower = affiliateAddress.toLowerCase();
      const rawPayments = events
        .filter((e) => e.args.affiliate?.toLowerCase() === affiliateLower)
        .map((e) => ({
          txHash:        e.transactionHash,
          amountUsdc:    Number(e.args.affiliateRevenue) / 1e6,
          feeUsdc:       Number(e.args.feeAmount) / 1e6,
          traderAddress: e.args.trader,
          blockNumber:   e.blockNumber,
        }));

      // Record first-seen timestamps for monthly volume calculation
      const tsStore = recordNewPayments(rawPayments);
      const payments = rawPayments.map((p) => ({
        ...p,
        seenAt: tsStore[p.txHash] ?? Date.now(),
      }));

      // Deduplicate by trader — only the first registration per trader counts
      const seenTraders = new Set();
      const firstFeePayments = payments.filter((p) => {
        const addr = p.traderAddress?.toLowerCase();
        if (!addr || seenTraders.has(addr)) return false;
        seenTraders.add(addr);
        return true;
      });

      const totalCommissionUsdc = payments.reduce((sum, p) => sum + p.amountUsdc, 0);
      const totalReferrals = firstFeePayments.length;

      // Monthly volume: sum of feeUsdc for first-fee events seen this calendar month
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
      const monthlyVolumeUsdc = firstFeePayments
        .filter((p) => p.seenAt >= monthStart)
        .reduce((sum, p) => sum + p.feeUsdc, 0);

      // Read on-chain affiliate tier and monthly volume (source of truth).
      // Falls back to client-side values if contract reads fail.
      let onChainRateBps = null;
      let onChainMonthlyVolume = null;
      try {
        const [rateBps, volumeRaw] = await Promise.all([
          readContract({
            contract: pool,
            method: "function getAffiliateRateBps(address) view returns (uint256)",
            params: [affiliateAddress],
          }),
          readContract({
            contract: pool,
            method: "function getAffiliateMonthlyVolume(address) view returns (uint256)",
            params: [affiliateAddress],
          }),
        ]);
        onChainRateBps = Number(rateBps);
        onChainMonthlyVolume = Number(volumeRaw) / 1e6;
      } catch {
        // Contract may not have these methods yet (pre-upgrade); fall back
      }

      setStats({
        totalCommissionUsdc,
        totalReferrals,
        monthlyVolumeUsdc: onChainMonthlyVolume ?? monthlyVolumeUsdc,
        currentRateBps: onChainRateBps,
        payments,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("useAffiliateStats:", err);
      setStats((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [affiliateAddress]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { ...stats, refetch: fetchStats };
}

export const useAffiliateStats = IS_SCREENSHOTS ? useAffiliateStatsMock : useAffiliateStatsReal;
