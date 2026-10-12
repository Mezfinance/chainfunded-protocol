import { useState, useEffect, useRef } from "react";
import { getContract, getContractEvents, prepareEvent } from "thirdweb";
import { getRpcClient, eth_blockNumber } from "thirdweb/rpc";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { base44 } from "@/api/base44Client";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === "true";

// ~7 days of blocks at 12s/block on Ethereum mainnet (~7,200/day).
// Slightly generous on faster L2s; the upper bound (toBlock=latest) caps total range.
const SEVEN_DAYS_BLOCKS = 7n * 7200n;

const challengeRegisteredEvent = prepareEvent({
  signature:
    "event ChallengeRegistered(address indexed trader, string indexed accountId, uint256 accountSizeUsdc, uint8 phase, uint256 feeAmount, uint256 protocolRevenue, uint256 lpProfitPoolShare, uint256 lpCapitalShare, address indexed affiliate, uint256 affiliateRevenue)",
});

const payoutClaimedEvent = prepareEvent({
  signature:
    "event PayoutClaimed(address indexed trader, string indexed accountId, string indexed payoutId, uint256 grossProfitUsdc, uint256 traderAmount, uint256 protocolRevenue, uint256 lpProfitShare)",
});

const depositedEvent = prepareEvent({
  signature: "event Deposited(address indexed lp, uint256 usdcAmount, uint256 cfndMinted)",
});

const fundedRegisteredEvent = prepareEvent({
  signature:
    "event FundedRegistered(address indexed trader, string indexed phase2AccountId, string indexed fundedAccountId, uint256 accountSizeUsdc)",
});

function dedupe(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/**
 * Aggregates real recent activity across the protocol for the FOMO ticker:
 *   - On-chain: ChallengeRegistered, PayoutClaimed, Deposited, FundedRegistered
 *   - Off-chain: closed Trades from Base44
 *
 * Window: last ~7 days. Returns up to ~50 most-recent events, newest first.
 * Re-polls every 60s to surface fresh activity. Pauses while tab is hidden.
 */
export function useFomoFeed({ enabled = true } = {}) {
  const [events, setEvents] = useState([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!enabled || IS_SCREENSHOTS) return;
    if (!POOL_ADDRESS) return;

    cancelledRef.current = false;

    async function fetchAll() {
      try {
        const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
        const rpc = getRpcClient({ client: thirdwebClient, chain });

        let fromBlock;
        try {
          const latest = await eth_blockNumber(rpc);
          fromBlock = latest > SEVEN_DAYS_BLOCKS ? latest - SEVEN_DAYS_BLOCKS : 0n;
        } catch {
          fromBlock = undefined; // fall through to provider default
        }

        const eventArgs = fromBlock !== undefined ? { fromBlock } : {};

        const [registered, payouts, deposits, funded, tradesRaw] = await Promise.all([
          getContractEvents({ contract: pool, events: [challengeRegisteredEvent], ...eventArgs }).catch(() => []),
          getContractEvents({ contract: pool, events: [payoutClaimedEvent], ...eventArgs }).catch(() => []),
          getContractEvents({ contract: pool, events: [depositedEvent], ...eventArgs }).catch(() => []),
          getContractEvents({ contract: pool, events: [fundedRegisteredEvent], ...eventArgs }).catch(() => []),
          base44.entities.Trade
            .filter({ status: "closed" }, "-close_time", 25)
            .catch(() => []),
        ]);

        if (cancelledRef.current) return;

        const onChain = [
          ...registered.map((e) => ({
            id: `cr-${e.transactionHash}-${e.logIndex}`,
            type: "challenge",
            address: e.args.trader,
            sizeUsdc: Number(e.args.accountSizeUsdc) / 1e6,
            phase: Number(e.args.phase),
            blockNumber: Number(e.blockNumber),
          })),
          ...payouts.map((e) => ({
            id: `po-${e.transactionHash}-${e.logIndex}`,
            type: "payout",
            address: e.args.trader,
            amountUsdc: Number(e.args.traderAmount) / 1e6,
            blockNumber: Number(e.blockNumber),
          })),
          ...deposits.map((e) => ({
            id: `dp-${e.transactionHash}-${e.logIndex}`,
            type: "lp_deposit",
            address: e.args.lp,
            amountUsdc: Number(e.args.usdcAmount) / 1e6,
            blockNumber: Number(e.blockNumber),
          })),
          ...funded.map((e) => ({
            id: `fn-${e.transactionHash}-${e.logIndex}`,
            type: "funded",
            address: e.args.trader,
            sizeUsdc: Number(e.args.accountSizeUsdc) / 1e6,
            blockNumber: Number(e.blockNumber),
          })),
        ];

        // Trade list comes back newest first. Filter out anything older than 7 days.
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const tradeArr = Array.isArray(tradesRaw) ? tradesRaw : [];
        const trades = tradeArr
          .filter((t) => t && t.close_time && new Date(t.close_time).getTime() >= sevenDaysAgo)
          .filter((t) => typeof t.pnl === "number")
          .map((t) => ({
            id: `tr-${t.id}`,
            type: "trade",
            address: t.trader_address || null,
            symbol: t.symbol,
            direction: t.direction,
            pnl: t.pnl,
            closeTime: new Date(t.close_time).getTime(),
          }));

        // Order on-chain by block desc; trades already by close_time desc.
        onChain.sort((a, b) => b.blockNumber - a.blockNumber);

        // Interleave so ticker isn't dominated by one type.
        const merged = [];
        const buckets = [onChain, trades];
        let i = 0;
        while (merged.length < 50 && buckets.some((b) => b.length > 0)) {
          const bucket = buckets[i % buckets.length];
          if (bucket.length > 0) merged.push(bucket.shift());
          i++;
        }

        setEvents(dedupe(merged));
      } catch {
        // Silent: FOMO ticker is non-essential.
      }
    }

    fetchAll();
    const intervalId = setInterval(() => {
      if (!document.hidden) fetchAll();
    }, 60_000);

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
    };
  }, [enabled]);

  return events;
}
