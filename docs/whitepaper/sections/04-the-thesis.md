# The thesis

The protocol's payout function is fully specified on-chain. Given a
valid `payoutId`, an N-of-M signature set over the canonical
EIP-712 typed message, and a snapshotted challenge state in
`challenges[accountId]`, `ChainFundedPool.claimPayout` produces
exactly one of two outcomes: a USDC transfer to the trader and an
emitted `PayoutClaimed` event, or a transaction-level revert
referencing a specific named custom error. There is no third
outcome.

## On-chain pre-conditions

`claimPayout(payoutId, signatures, ...)` enforces, in order:

1. **Replay protection.** `settledPayouts[payoutId]` must be `false`,
   else `PayoutAlreadySettled`.
2. **Signature aggregate.** `signatures.length >= signatureThreshold`,
   else `InsufficientSignatures`. Each signature must be from
   `authorisedSigners[]` and the array must be sorted ascending by
   recovered signer address with no duplicates, else
   `UnauthorizedSigner` or `DuplicateOrUnsortedSignature`.
3. **Deadline.** `block.timestamp <= deadline`, else
   `SignatureExpired`.
4. **Rule re-verification.** For each rule snapshotted at the
   challenge's `registerChallenge` call:
   - `worstDailyLoss > maxDailyLossBps` ⇒ `RuleBreachedDailyLoss`
   - `maxDrawdown > maxTotalLossBps` ⇒ `RuleBreachedTotalLoss`
   - `tradingDays < minTradingDays` ⇒ `RuleBreachedMinDays`
   - `grossProfit < profitTarget` ⇒ `RuleBreachedProfitTarget`
   - `bestDay > maxBestDayBps` ⇒ `RuleBreachedBestDay`
5. **Liquidity availability.** `lpCapitalBalance() >= traderShare`,
   else `InsufficientLPCapital`.

If all pre-conditions hold, `traderShare = grossProfit *
traderShareBps / BPS` is transferred to the trader, the firm cut
is split between `labsWallet` and the LP profit pool per
`FIRM_CUT_PROTOCOL_BPS = 8000`, `settledPayouts[payoutId]` is set
to `true`, and `PayoutClaimed` is emitted.

## Independence of the two verification gates

The trading engine and the signer set produce a single artefact —
the signed payout proof — which `claimPayout` then re-verifies
against the rules registered at the time the trader paid the fee.
The two computations are independent:

- The off-chain signing process is sufficient but not necessary
  to block a bad payout: signers will refuse to sign a proof for a
  breached account.
- The on-chain re-verification is necessary but not sufficient: it
  catches any divergence between the signed proof's claimed P&L and
  the rule-bound state encoded at registration.

Either gate alone produces a sound stop on a bad payout. Both gates
agreeing is the precondition for a successful settlement. A
compromise of all M signers does not produce a valid payout if the
account's rule state is breached, because the on-chain check fails
independently of the signature validity.

## Liveness

The protocol does not impose a contract-level expiry on a valid
proof beyond the explicit `deadline` field. A funded trader who
fails to find N signers within the deadline window can re-request
a payout with a new `deadline`; the pool's state for that
challenge is unchanged until `settledPayouts[payoutId]` is set.
There is no protocol-level mechanism that reduces a trader's
earned payout amount as time passes.
