import { useState, useEffect, useCallback } from "react";
import { readContract, getContract, getContractEvents, prepareEvent } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { MOCK_CHAIN_POOL } from "@/lib/screenshotMocks";

const profitClaimedEvent = prepareEvent({
  signature: "event ProfitClaimed(address indexed lp, uint256 amount)",
});

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

/**
 * Reads live on-chain state from ChainFundedPool.
 * Polls every 15 seconds. Returns human-readable values (divided by 1e6).
 *
 * Pool architecture:
 *   lpCapitalBalance  = total USDC − profitPoolBalance  (backs CFND NAV, at risk)
 *   profitPoolBalance = accumulated LP profit pool       (reward-per-token, 30-day lockup)
 *   cfndPriceUsdc     = lpCapitalBalance / cfndSupply
 *
 * @param {string|null} userAddress - Connected wallet address (optional)
 * @param {string[]} lpAddresses - All LP addresses to fetch pending profit for (for table display)
 */
const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

function useChainFundedPoolMock() {
  return { ...MOCK_CHAIN_POOL, refetch: () => {} };
}

function useChainFundedPoolReal(userAddress = null, lpAddresses = []) {
  const [state, setState] = useState({
    lpCapitalUsdc: null,     // human-readable LP capital balance (CFND-backed)
    profitPoolUsdc: null,    // human-readable LP profit pool balance (claimable)
    cfndSupply: null,        // human-readable total CFND supply
    cfndPriceUsdc: null,     // NAV price in USDC
    solvencyRatio: null,     // capital / CFND supply (1.0 = fully solvent)
    userCfndBalance: null,
    userPositionUsdc: null,  // LP capital value for connected wallet
    userPendingProfit: null, // unclaimed profit for connected wallet (claimable now)
    userYieldClaimed: null,  // sum of all ProfitClaimed events for this wallet
    lpYields: {},            // { address: pendingProfitUsdc } for all LP addresses
    loading: true,
    error: null,
  });

  // Stable serialised key so useCallback re-runs only when the address list changes
  const lpAddressesKey = lpAddresses.slice().sort().join(",");

  const fetchData = useCallback(async () => {
    if (!POOL_ADDRESS) {
      setState((s) => ({ ...s, loading: false, error: "Pool address not configured." }));
      return;
    }

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      const [lpCapRaw, profitRaw, cfndAddr] = await Promise.all([
        readContract({ contract: pool, method: "function lpCapitalBalance() view returns (uint256)" }),
        readContract({ contract: pool, method: "function profitPoolBalance() view returns (uint256)" }),
        readContract({ contract: pool, method: "function cfndTokenAddress() view returns (address)" }),
      ]);

      const cfndToken = getContract({ client: thirdwebClient, chain, address: cfndAddr });
      const supplyRaw = await readContract({
        contract: cfndToken,
        method: "function totalSupply() view returns (uint256)",
      });

      let userCfndBalance = null;
      let userPositionUsdc = null;
      let userPendingProfit = null;
      let userYieldClaimed = null;

      if (userAddress) {
        const [userBalRaw, pendingRaw, claimEvents] = await Promise.all([
          readContract({
            contract: cfndToken,
            method: "function balanceOf(address account) view returns (uint256)",
            params: [userAddress],
          }),
          readContract({
            contract: pool,
            method: "function pendingProfit(address lp) view returns (uint256)",
            params: [userAddress],
          }),
          getContractEvents({
            contract: pool,
            events: [profitClaimedEvent],
            filters: { lp: userAddress },
          }).catch(() => []),
        ]);

        userCfndBalance = Number(userBalRaw) / 1e6;
        userPendingProfit = Number(pendingRaw) / 1e6;
        userYieldClaimed = claimEvents
          .filter(e => e.args.lp?.toLowerCase() === userAddress.toLowerCase())
          .reduce((sum, e) => sum + Number(e.args.amount), 0) / 1e6;

        if (userBalRaw > 0n) {
          const previewRaw = await readContract({
            contract: pool,
            method: "function previewWithdraw(uint256 cfndAmount) view returns (uint256)",
            params: [userBalRaw],
          });
          userPositionUsdc = Number(previewRaw) / 1e6;
        } else {
          userPositionUsdc = 0;
        }
      }

      // Fetch pendingProfit for all LP addresses (for table display, works when logged out)
      const uniqueAddrs = [...new Set(lpAddresses.filter(Boolean))];
      const lpYieldEntries = await Promise.all(
        uniqueAddrs.map((addr) =>
          readContract({
            contract: pool,
            method: "function pendingProfit(address lp) view returns (uint256)",
            params: [addr],
          })
            .then((raw) => [addr, Number(raw) / 1e6])
            .catch(() => [addr, null])
        )
      );
      const lpYields = Object.fromEntries(lpYieldEntries.filter(([, v]) => v !== null));

      // For the connected user, include historical claims so the table is consistent
      // whether signed in or out (signed-out can only show pending, signed-in shows total)
      if (userAddress && userYieldClaimed !== null && lpYields[userAddress] !== undefined) {
        lpYields[userAddress] = (lpYields[userAddress] ?? 0) + userYieldClaimed;
      }

      const lpCapitalUsdc  = Number(lpCapRaw) / 1e6;
      const cfndSupplyVal  = Number(supplyRaw) / 1e6;
      // NAV capped at $1.00 — fee revenue in the pool is surplus that absorbs
      // payout risk, not LP entitlement. NAV only drops below $1 when payouts
      // deplete capital below CFND supply.
      const rawRatio       = cfndSupplyVal > 0 ? lpCapitalUsdc / cfndSupplyVal : 1.0;
      const cfndPriceUsdc  = Math.min(rawRatio, 1.0);
      const solvencyRatio  = Math.min(rawRatio, 1.0);

      setState({
        lpCapitalUsdc,
        profitPoolUsdc: Number(profitRaw) / 1e6,
        cfndSupply: cfndSupplyVal,
        cfndPriceUsdc,
        solvencyRatio,
        userCfndBalance,
        userPositionUsdc,
        userPendingProfit,
        userYieldClaimed,
        lpYields,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("useChainFundedPool:", err);
      setState((s) => ({ ...s, loading: false, error: err.message || "Failed to read contract." }));
    }
  }, [userAddress, lpAddressesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}

export const useChainFundedPool = IS_SCREENSHOTS ? useChainFundedPoolMock : useChainFundedPoolReal;
