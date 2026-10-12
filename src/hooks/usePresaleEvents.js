/**
 * usePresaleEvents — reads CFGPresale on-chain events for the live raise feed,
 * polling every `pollMs`.
 *
 *  - Returns recent `Purchased` buys (newest first) for the live feed.
 *  - Fires a `cf:settlement` window event on each NEW buy so the app-wide
 *    SettlementField pulses (capital settling on-chain).
 *
 * Degrades gracefully: if the contract isn't configured or the RPC range query
 * fails, it simply returns an empty array. Set VITE_PRESALE_DEPLOY_BLOCK so the
 * range query starts at the deploy block rather than scanning from genesis.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { getContract, getContractEvents, prepareEvent } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { PRESALE } from "@/config/presale";

const purchasedEvent = prepareEvent({
  signature: "event Purchased(address indexed buyer, uint256 usdSpent, uint256 cfgOut, uint256 newTier)",
});

export function usePresaleEvents(pollMs = 15_000) {
  const [buys, setBuys] = useState([]);
  const seen = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!PRESALE.presaleAddress) return;
    try {
      const contract = getContract({ client: thirdwebClient, chain, address: PRESALE.presaleAddress });
      const fromBlock = PRESALE.deployBlock ? BigInt(PRESALE.deployBlock) : 0n;

      const purchased = await getContractEvents({ contract, events: [purchasedEvent], fromBlock, toBlock: "latest" });

      // ── recent buys (newest first) ──
      const list = purchased
        .map((l) => ({
          key: `${l.transactionHash}-${l.logIndex}`,
          buyer: l.args.buyer,
          usd: Number(l.args.usdSpent) / 1e6,
          cfg: Number(l.args.cfgOut) / 1e18,
          block: Number(l.blockNumber),
        }))
        .sort((a, b) => b.block - a.block);
      setBuys(list.slice(0, 12));

      // ── settlement pulse on genuinely new buys (skip the first-load flood) ──
      for (const b of list) {
        if (!seen.current.has(b.key)) {
          seen.current.add(b.key);
          if (!firstLoad.current) {
            window.dispatchEvent(new CustomEvent("cf:settlement", { detail: {} }));
          }
        }
      }
      firstLoad.current = false;
    } catch {
      /* RPC range/limit error — degrade to empty */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { buys };
}
