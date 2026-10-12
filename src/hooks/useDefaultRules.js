import { useState, useEffect, useCallback } from "react";
import { readContract, getContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";

/**
 * Reads the current default challenge rules from ChainFundedPool.
 * These are set by governance via setDefaultRules() and affect
 * all future challenge registrations.
 *
 * Returns human-readable percentages (e.g. 10 for 10%) and raw BPS values.
 * Auto-refreshes every 60 seconds to pick up governance changes.
 */

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

const RULE_METHODS = [
  "function defaultPhase1ProfitTargetBps() view returns (uint256)",
  "function defaultPhase2ProfitTargetBps() view returns (uint256)",
  "function defaultMaxDailyLossBps() view returns (uint256)",
  "function defaultMaxTotalLossBps() view returns (uint256)",
  "function defaultMinTradingDays() view returns (uint256)",
  "function defaultTraderShareBps() view returns (uint256)",
  "function defaultMaxBestDayBps() view returns (uint256)",
];

function bpsToPercent(bps) {
  return Number(bps) / 100;
}

export function useDefaultRules() {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!POOL_ADDRESS) {
      // Fallback to hardcoded defaults if contract not configured
      setRules({
        phase1TargetBps: 1000, phase1Target: 10,
        phase2TargetBps: 500,  phase2Target: 5,
        maxDailyLossBps: 500,  maxDailyLoss: 5,
        maxTotalLossBps: 1000, maxTotalLoss: 10,
        minTradingDays: 4,
        traderShareBps: 8000, traderShare: 80,
        maxBestDayBps: 5000,  maxBestDay: 50,
        isFromContract: false,
      });
      setLoading(false);
      return;
    }

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      const results = await Promise.all(
        RULE_METHODS.map(method => readContract({ contract: pool, method }))
      );

      const [p1, p2, daily, total, days, share, bestDay] = results;

      setRules({
        phase1TargetBps: Number(p1), phase1Target: bpsToPercent(p1),
        phase2TargetBps: Number(p2), phase2Target: bpsToPercent(p2),
        maxDailyLossBps: Number(daily), maxDailyLoss: bpsToPercent(daily),
        maxTotalLossBps: Number(total), maxTotalLoss: bpsToPercent(total),
        minTradingDays: Number(days),
        traderShareBps: Number(share), traderShare: bpsToPercent(share),
        maxBestDayBps: Number(bestDay), maxBestDay: bpsToPercent(bestDay),
        isFromContract: true,
      });
      setError(null);
    } catch (err) {
      console.warn("[Rules] Failed to read from contract:", err.message);
      // Fallback to hardcoded defaults
      setRules({
        phase1TargetBps: 1000, phase1Target: 10,
        phase2TargetBps: 500,  phase2Target: 5,
        maxDailyLossBps: 500,  maxDailyLoss: 5,
        maxTotalLossBps: 1000, maxTotalLoss: 10,
        minTradingDays: 4,
        traderShareBps: 8000, traderShare: 80,
        maxBestDayBps: 5000,  maxBestDay: 50,
        isFromContract: false,
      });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [refresh]);

  return { rules, loading, error, refresh };
}
