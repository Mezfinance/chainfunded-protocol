# Payout enforcement

The `claimPayout` function is the protocol's settlement entry
point. It is `external nonReentrant whenNotPaused`, takes a payout
identifier, an aggregated signature set, and a struct describing
the asserted trading result, and produces — atomically — either a
USDC transfer plus a `PayoutClaimed` event, or a transaction-level
revert.

## Function pre-conditions

The function reverts on any of the following conditions before any
state mutation:

| Pre-condition violated | Custom error |
|---|---|
| `settledPayouts[payoutId] == true` | `PayoutAlreadySettled` |
| `block.timestamp > deadline` | `SignatureExpired` |
| `signatures.length < signatureThreshold` | `InsufficientSignatures` |
| any signer ∉ `authorisedSigners[]` | `UnauthorizedSigner` |
| signatures unsorted or contain a duplicate signer | `DuplicateOrUnsortedSignature` |
| `worstDailyLoss > challenge.maxDailyLossBps` | `RuleBreachedDailyLoss` |
| `maxDrawdown > challenge.maxTotalLossBps` | `RuleBreachedTotalLoss` |
| `tradingDays < challenge.minTradingDays` | `RuleBreachedMinDays` |
| `grossProfit < challenge.profitTarget` (where applicable) | `RuleBreachedProfitTarget` |
| `bestDay > challenge.maxBestDayBps` | `RuleBreachedBestDay` |
| `lpCapitalBalance() < traderShare` | `InsufficientLPCapital` |

Each error is a distinct named custom error type; the failing
condition is identifiable from the transaction receipt without
reference to off-chain logs.

## Independence of off-chain attestation and on-chain re-verification

The signed payout proof is produced off-chain by N of M signers,
each of whom independently re-derives the trader's P&L from the
trade ledger and re-checks the rule set. The signers' role is
attestation: they produce a typed message hash signed with their
private keys, asserting that the supplied P&L is consistent with
the asserted account state.

`claimPayout` then re-runs the same rule evaluation on-chain,
against the rule parameters snapshotted in `challenges[accountId]`
at the time the trader paid the fee. The on-chain evaluation does
not consume or trust the signers' assertion of P&L beyond what is
inside the message hash they signed. If the signers attest to a
P&L that, when applied to the snapshotted rule set, would breach a
rule, the contract reverts irrespective of signature validity.

This independence rules out the failure mode in which a compromised
signer set produces a valid signature aggregate over a fraudulent
P&L: such an aggregate either does not breach the snapshotted rules
(in which case the payout is correct by construction) or does
breach them (in which case the on-chain check catches it).

## Out of scope

`claimPayout` does not arbitrate disputes about the underlying
trade ledger. It does not verify market data correctness, exchange
uptime, or the temporal ordering of off-chain trades. These are
operational concerns of the trading engine and the signer set; the
contract's guarantee terminates at the boundary "the supplied P&L,
re-evaluated against the registered rules, does not breach any of
them".

A trading-engine bug that mis-records a trade as profitable when it
was unprofitable would produce a P&L that the on-chain check
accepts. Mitigating this class of failure is the subject of §17
(security posture).

## Diagram

![Figure 7 · Failure paths · three terminal outcomes](failure-paths.svg)
