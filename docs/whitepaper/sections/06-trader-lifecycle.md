# Trader lifecycle

A trader's interaction with the protocol consists of four discrete
operations: register an evaluation challenge, trade simulated
capital, advance through phase transitions verified by the
multisig, and settle USDC payouts on-chain. Operations 1, 3, and 4
are on-chain transactions against `ChainFundedPool`; operation 2 is
off-chain in the trading engine.

## 1 · `registerChallenge`

Two transactions:

```
USDC.approve(pool, fee)
pool.registerChallenge(fee, accountId, accountSize, phase, affiliate, gasReimbursementUsdc)
```

The pool validates the fee against `challengeTierFee[accountSize]`,
pulls `feeAmount` USDC, and partitions it per the on-chain
splits: `FEE_PROTOCOL_BPS = 2400` to `labsWallet`,
`FEE_PROFIT_POOL_BPS = 600` to the LP profit pool, an affiliate
share per the §13 ladder if `affiliate != address(0)`, and the
remainder to LP capital. The `Challenge` struct is written to
`challenges[accountId]` with the rule snapshot
(`profitTargetBps`, `maxDailyLossBps`, `maxTotalLossBps`,
`minTradingDays`, `traderShareBps`, `maxBestDayBps`) frozen at
this block. Subsequent owner calls to `setDefaultRules` do not
modify already-registered challenges.

Reverts on `feeAmount == 0` (`InvalidAmount`),
`accountSize == 0` (`InvalidAmount`), `phase != 1` (`InvalidPhase`),
duplicate `accountId` (`ChallengeAlreadyRegistered`),
`affiliate == msg.sender` (`SelfReferral`),
`cfndToken.totalSupply() == 0` (`PoolMustHaveDeposits`), and
fee/tier mismatch (`TierNotEnabled`).

## 2 · Trading

The trader places and closes positions through the in-app terminal
against a simulated account balance. The trading engine maintains
real-time per-trader state — open positions, P&L, daily loss,
drawdown, trading-day count, best-day percentage — and rejects
trades that would cross a hard limit. The pool has no visibility
into trade execution; its next interaction with the challenge is
the phase-transition or payout call.

This separation is by construction: putting trade execution
on-chain would impose latency and gas costs that exceed the
operational utility, given that the contract's settlement guarantee
does not depend on on-chain trade execution.

## 3 · Phase transitions

When a trader meets the phase profit target without breaching any
loss or trading-day rule, the trading engine assembles an EIP-712
typed message and forwards it to the signer set. Each signer
independently re-derives the trader's P&L from the trade ledger
and signs an ECDSA proof if the rules verify. The trader collects
N (where `N = signatureThreshold`, currently `3`) of `M` signatures
and submits:

```
pool.registerPhase2(accountId, signatures)    // Phase 1 → Phase 2
pool.registerFunded(accountId, signatures)    // Phase 2 → Funded
```

Both calls verify the signature aggregate with the same logic used
in `claimPayout` (§11) and advance `challenges[accountId].phase`.

## 4 · `claimPayout`

A funded trader issues a payout request off-chain, signers sign a
proof of the asserted P&L, and the trader submits:

```
pool.claimPayout(payoutId, signatures, ...)
```

The function re-runs the rule check against the snapshotted
`Challenge` struct, splits the asserted profit by `traderShareBps`
(default `8000`) into `traderShare` and `firmCut`, transfers the
trader's share, splits the firm cut between `labsWallet` and the
LP profit pool, sets `settledPayouts[payoutId] = true`, and emits
`PayoutClaimed`. The function is replay-protected, re-entrancy-
guarded, and pause-respecting.

Once mined, the settlement is terminal. The pool exposes no
function that reverses a settled payout, no admin path that
clawbacks transferred USDC, and no upgrade path that would do
either without breaking the storage-layout baseline.

## Diagram

![Figure 2 · Trader lifecycle — fee to payout](trader-user-flow.svg)
