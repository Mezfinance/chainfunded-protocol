# Abstract

ChainFunded is an Ethereum protocol for the permissioned-by-rule
evaluation of proprietary trading strategies. The on-chain surface
consists of a single UUPS-proxied core contract,
`ChainFundedPool`, which (i) collects evaluation fees in USDC,
(ii) holds pooled liquidity reserves and mints the `CFNDToken`
ERC-20 share token against deposited capital at a 1:1 NAV ratio,
(iii) executes payouts to passing traders subject to N-of-M
ECDSA signature aggregation over the protocol's authorised signer
set, and (iv) emits a deterministic event log for every state
transition.

The protocol's central operational property is that
`claimPayout(payoutId, signatures, …)` is a permissionless function
whose pre-conditions — signature threshold, signature validity, and
re-verification of the trading rules snapshotted at challenge
registration — are computable from the function arguments and the
pool's storage. The function either transfers USDC to the trader
and emits `PayoutClaimed`, or reverts with a named custom error.
The contract has no admin path that bypasses these pre-conditions.

The remainder of this paper formalises three claims that follow
from this construction:

1. **Settlement is monotonic and non-discretionary.** Each
   `claimPayout` invocation either advances the protocol's state
   (`settledPayouts[payoutId] := true`, USDC transferred) or
   reverts atomically. Replay protection via `settledPayouts` and
   re-entrancy protection via OpenZeppelin's `ReentrancyGuard`
   together rule out partial settlement.
2. **The on-chain surface is bounded and storage-stable.** The
   pool inherits from `Ownable2StepUpgradeable`, `ReentrancyGuard`,
   `PausableUpgradeable`, and `UUPSUpgradeable`. New state variables
   are append-only across upgrades and are checked against
   `contracts/storage-layout-baseline.json` in CI.
3. **All economic parameters are public state.** Fee splits
   (`FEE_PROTOCOL_BPS`, `FEE_PROFIT_POOL_BPS`,
   `MAX_AFFILIATE_BPS`), challenge tier prices
   (`challengeTierFee[size]`), default rules
   (`defaultPhase1ProfitTargetBps` et al.), and the per-CFND profit
   accumulator (`accProfitPerToken`) are readable from the pool
   at any block.

CFG token mechanics and DAO governance are out of scope for this
document and are described at
[chainfundeddao.org](https://chainfundeddao.org).
