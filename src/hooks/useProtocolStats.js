import { useState, useEffect, useCallback } from "react";
import { readContract, getContract, getContractEvents, prepareEvent } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { MOCK_PROTOCOL_STATS } from "@/lib/screenshotMocks";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

const payoutClaimedEvent = prepareEvent({
  signature:
    "event PayoutClaimed(address indexed trader, string indexed accountId, string indexed payoutId, uint256 grossProfitUsdc, uint256 traderAmount, uint256 protocolRevenue, uint256 lpProfitShare)",
});

const profitClaimedEvent = prepareEvent({
  signature: "event ProfitClaimed(address indexed lp, uint256 amount)",
});

/**
 * Fetches three headline protocol metrics for the landing page.
 * No wallet connection required — works for unauthenticated visitors.
 *
 * tvlUsdc          — lpCapitalBalance + profitPoolBalance (total USDC in contract)
 * totalPayoutsUsdc — sum of all PayoutClaimed.traderAmount events
 * totalYieldUsdc   — sum of all ProfitClaimed.amount events + current profitPoolBalance
 */
const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

function useProtocolStatsMock() {
  return { ...MOCK_PROTOCOL_STATS, refetch: () => {} };
}

function useProtocolStatsReal() {
  const [stats, setStats] = useState({
    tvlUsdc: null,
    totalPayoutsUsdc: null,
    totalYieldUsdc: null,
    payoutCount: null,
    loading: true,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    if (!POOL_ADDRESS) {
      setStats((s) => ({ ...s, loading: false, error: "Pool address not configured." }));
      return;
    }

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      const [lpCapRaw, profitRaw, payoutEvents, profitEvents] = await Promise.all([
        readContract({ contract: pool, method: "function lpCapitalBalance() view returns (uint256)" }),
        readContract({ contract: pool, method: "function profitPoolBalance() view returns (uint256)" }),
        getContractEvents({ contract: pool, events: [payoutClaimedEvent] }).catch(() => []),
        getContractEvents({ contract: pool, events: [profitClaimedEvent] }).catch(() => []),
      ]);

      const tvlUsdc = (Number(lpCapRaw) + Number(profitRaw)) / 1e6;

      const totalPayoutsUsdc = payoutEvents.reduce(
        (sum, e) => sum + Number(e.args.traderAmount),
        0
      ) / 1e6;

      const totalClaimedYield = profitEvents.reduce(
        (sum, e) => sum + Number(e.args.amount),
        0
      ) / 1e6;
      const totalYieldUsdc = totalClaimedYield + Number(profitRaw) / 1e6;

      setStats({ tvlUsdc, totalPayoutsUsdc, totalYieldUsdc, payoutCount: payoutEvents.length, loading: false, error: null });
    } catch (err) {
      console.error("useProtocolStats:", err);
      setStats((s) => ({ ...s, loading: false, error: err.message || "Failed to fetch stats." }));
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { ...stats, refetch: fetchStats };
}

export const useProtocolStats = IS_SCREENSHOTS ? useProtocolStatsMock : useProtocolStatsReal;
