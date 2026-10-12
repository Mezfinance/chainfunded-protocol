import { useEffect, useRef, useCallback } from "react";
import { readContract, getContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { base44 } from "@/api/base44Client";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const POLL_INTERVAL = 15_000;       // was 3s — too aggressive with many accounts
const RETRY_BACKOFF_MS = 60_000;    // skip an account for 60s after a failed Base44 write

/**
 * Polls on-chain for accounts not yet marked onchain_registered in Base44.
 * When the contract confirms createdAt > 0 for an account, updates Base44 and
 * calls onSync(accountId) so the caller can update local state immediately.
 *
 * Per-account retry backoff prevents a Base44 429 storm: when many accounts
 * are pending and Base44 starts rate-limiting our updates, the prior 3s/26-PUT
 * loop produced sustained 429s and locked up the admin dashboard. We now
 * record the timestamp of each attempted write and skip that account until
 * RETRY_BACKOFF_MS has passed.
 *
 * @param {Array}    accounts - Current ChallengeAccount list
 * @param {Function} onSync   - Called with accountId when an account is confirmed on-chain
 */
export function useOnchainRegistrationSync(accounts, onSync) {
  const onSyncRef = useRef(onSync);
  useEffect(() => { onSyncRef.current = onSync; }, [onSync]);
  // accountId → ms timestamp of last write attempt (for backoff)
  const lastAttemptAt = useRef(new Map());

  const check = useCallback(async () => {
    if (!POOL_ADDRESS || !accounts?.length) return;

    const now = Date.now();
    const unregistered = accounts.filter((a) => {
      if (a.onchain_registered) return false;
      const last = lastAttemptAt.current.get(a.id) || 0;
      return now - last > RETRY_BACKOFF_MS;
    });
    if (!unregistered.length) return;

    const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

    await Promise.allSettled(
      unregistered.map(async (acc) => {
        try {
          const onchainId = acc.account_id || acc.id;
          const ch = await readContract({
            contract: pool,
            method: "function getChallenge(string accountId) view returns ((address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps))",
            params: [onchainId],
          });
          if (ch.createdAt > 0n) {
            const update = { onchain_registered: true };
            if (acc.status === "pending") update.status = "active";
            // Record the attempt BEFORE the write so a 429 doesn't immediately
            // re-fire on the next tick. Cleared on success below.
            lastAttemptAt.current.set(acc.id, Date.now());
            await base44.entities.ChallengeAccount.update(acc.id, update);
            lastAttemptAt.current.delete(acc.id);
            onSyncRef.current?.(acc.id, acc.status === "pending");
          }
        } catch {
          // silently ignore — contract read failures and Base44 write
          // failures both fall here. The backoff timestamp set above keeps
          // failed accounts off the next tick.
        }
      })
    );
  }, [accounts]);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [check]);
}
