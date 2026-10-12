/**
 * useBlockNumber — live latest-block heartbeat for the active chain.
 *
 * Powers the "On-chain · #block" status indicator. Uses thirdweb's
 * watchBlockNumber subscription so it updates as new blocks land, with a
 * one-shot eth_blockNumber for the initial value.
 */
import { useState, useEffect } from "react";
import { getRpcClient, eth_blockNumber, watchBlockNumber } from "thirdweb/rpc";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === "true";

export function useBlockNumber() {
  const [blockNumber, setBlockNumber] = useState(null);

  useEffect(() => {
    if (IS_SCREENSHOTS) { setBlockNumber(21304118); return undefined; }

    let unwatch;
    let cancelled = false;
    const rpc = getRpcClient({ client: thirdwebClient, chain });

    // Initial value, then live subscription.
    eth_blockNumber(rpc)
      .then((n) => { if (!cancelled) setBlockNumber(Number(n)); })
      .catch(() => {});

    try {
      unwatch = watchBlockNumber({
        client: thirdwebClient,
        chain,
        onNewBlockNumber: (n) => { if (!cancelled) setBlockNumber(Number(n)); },
      });
    } catch { /* RPC unavailable — leave at initial value */ }

    return () => { cancelled = true; if (typeof unwatch === "function") unwatch(); };
  }, []);

  return blockNumber;
}
