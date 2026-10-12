// On-chain verification for reviews. Reads the ChainFundedPool contract
// directly (public RPC, no wallet) so anyone can confirm — trustlessly — that
// a reviewer really registered a challenge on-chain, and that their payout was
// actually settled by the contract. See docs/reviews-spec.md.
import { readContract, getContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

const GET_CHALLENGE =
  "function getChallenge(string accountId) view returns ((address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps))";
const SETTLED_PAYOUTS = "function settledPayouts(string) view returns (bool)";

function pool() {
  if (!POOL_ADDRESS) return null;
  return getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
}

/**
 * Verify a review's on-chain facts. Returns:
 *   {
 *     supported,            // false if no contract configured
 *     challengeOk,          // challenge exists on-chain AND its trader == reviewer
 *     challengeTrader,      // the on-chain trader address for that account
 *     accountSizeUsdc,      // on-chain account size (raw, 6dp USDC)
 *     settledOnChain,       // challenge.settled flag
 *     payoutChecked,        // we attempted a payout proof
 *     payoutOk,             // settledPayouts[payoutId] == true
 *     error,
 *   }
 */
export async function verifyReviewOnChain(review) {
  const out = {
    supported: !!POOL_ADDRESS,
    challengeOk: false,
    challengeTrader: null,
    accountSizeUsdc: null,
    settledOnChain: false,
    payoutChecked: false,
    payoutOk: false,
    error: null,
  };
  const contract = pool();
  if (!contract) { out.error = "No contract configured"; return out; }

  const wallet = String(review.traderAddress || "").toLowerCase();

  // 1. Challenge registration — getChallenge(accountId), createdAt > 0, trader match.
  if (review.accountId) {
    try {
      const ch = await readContract({ contract, method: GET_CHALLENGE, params: [String(review.accountId)] });
      out.challengeTrader = String(ch.trader || "").toLowerCase();
      out.accountSizeUsdc = ch.accountSizeUsdc != null ? ch.accountSizeUsdc.toString() : null;
      out.settledOnChain = !!ch.settled;
      out.challengeOk = ch.createdAt > 0n && out.challengeTrader === wallet && wallet !== "";
    } catch (e) {
      out.error = e?.message || "Challenge read failed";
    }
  }

  // 2. Payout settlement — settledPayouts[payoutId] (only for the gold tier).
  if (review.verification === "payout" && review.payoutId) {
    out.payoutChecked = true;
    try {
      out.payoutOk = await readContract({ contract, method: SETTLED_PAYOUTS, params: [String(review.payoutId)] });
    } catch (e) {
      if (!out.error) out.error = e?.message || "Payout read failed";
    }
  }

  return out;
}
