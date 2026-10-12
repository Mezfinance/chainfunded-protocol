# Appendix A · Threat model

Enumerates the adversaries the protocol's design takes seriously,
the capabilities each holds, and the on-chain mechanisms that
constrain them. Complements the risk-by-carrier framing of §16 —
this appendix is adversary-by-adversary, which is the framing an
auditor or security reviewer is most likely to use.

## A · Malicious trader

**Capability.** Any EOA can pay an evaluation fee and trade. A
malicious trader optimises trade execution against the rule set,
or attempts to extract funds beyond the fee paid.

| Attempt | Constrained by |
|---|---|
| Withdraw funds without satisfying rules | `claimPayout` re-verifies every rule snapshotted at registration against the asserted P&L. Any breach → named `RuleBreached*` revert (§11). |
| Submit a stale or already-claimed payout proof | `settledPayouts[payoutId]` flag is set on success → `PayoutAlreadySettled` on replay. `deadline` field checked against `block.timestamp` → `SignatureExpired`. |
| Forge signatures | `ECDSA.recover` on every signature, each must be in `authorizedSigners[]` → `UnauthorizedSigner`. |
| Register a free / zero-fee challenge to bypass economic cost | `feeAmount` must equal `challengeTierFee[accountSize]` exactly → `TierNotEnabled` otherwise. |

**Residual.** Maximum monetary loss to the protocol from a
malicious trader is bounded by zero — the trader can never extract
more than they could legitimately earn under the snapshotted rules.

## B · Malicious LP

**Capability.** Any EOA can deposit USDC and receive `CFND`. A
malicious LP attempts to game the profit accumulator, grief
withdrawal liveness, or extract more than their pro-rata share.

| Attempt | Constrained by |
|---|---|
| Deposit-then-withdraw in a single block to capture accrued yield without taking risk | `lastDepositBlock[lp] == block.number` check on `withdraw` → `SameBlockDeposit` revert. |
| Withdraw a CFND amount they don't hold | Standard ERC-20 balance check → `InsufficientCFND`. |
| Front-run a `claimPayout` to drain capital before settlement | All paths through the pool are `nonReentrant` and `whenNotPaused`; LP withdrawals and claim-payouts are serialised by the EVM's single-tx model. Withdrawal contention exists but does not exceed pro-rata. |
| Manipulate `accProfitPerToken` accumulator | Accumulator is internal state updated by the pool on every profit-pool credit; LP-callable functions only read it via `rewardDebt` reconciliation. No external setter. |

**Residual.** LP cannot extract more than their `cfndAmount × NAV`
plus their pending profit. NAV is determined entirely by pool state
they cannot directly write.

## C · Compromised signer subset (< threshold)

**Capability.** Attacker controls fewer than `signatureThreshold`
of the `M` authorised signer keys.

| Attempt | Constrained by |
|---|---|
| Forge a valid payout signature aggregate | `signatures.length >= signatureThreshold` check → `InsufficientSignatures`. Cannot meet threshold with fewer keys. |
| Submit a partial signature set with replays of the same compromised key | Signatures must be sorted ascending by recovered signer address with no duplicates → `DuplicateOrUnsortedSignature`. |
| Coerce a non-compromised signer to sign | Off-chain. Mitigation: independent signer environments, HSM key custody. |

**Residual.** No on-chain harm. Compromise of fewer than threshold
keys is operationally observable (signature flow stops working)
and rotatable (`removeSigner(addr)` then `addSigner(newAddr)`).

## D · Compromised signer set (≥ threshold)

**Capability.** Attacker controls at least `signatureThreshold`
keys and can produce valid signature aggregates over arbitrary
typed messages.

| Attempt | Constrained by |
|---|---|
| Sign a payout for an account that breached a rule | `claimPayout` re-verifies all rules against the snapshotted challenge state. The signature is valid; the rule check fails independently → `RuleBreached*` revert (§4, §11). |
| Sign a payout for an account whose registration the attacker fabricated | The pool's `challenges[accountId]` mapping is only writable through `registerChallenge` / `adminRegisterChallenge`. Fabrication requires either a fee payment (no economic gain) or admin-key compromise (separate threat). |
| Sign a P&L that consistent with the snapshotted rules but doesn't match the trader's actual trades | **Residual risk.** The on-chain check has no view of the trade ledger; a false P&L that satisfies the rule set is a valid payout from the contract's perspective. Mitigation is operational (per-signer independent replay) and detective (post-hoc audit of off-chain attestations against trade history). |

**Residual.** A coordinated full-set compromise can extract a
single fraudulent payout of any size within `lpCapitalBalance()`.
Mitigation is in signer-key custody discipline (HSM, geographic
distribution, distinct operational environments) and in raising
the threshold post-launch.

## E · Compromised pool owner

**Capability.** Attacker controls the `Ownable2Step` owner key
(2-of-2 governance multisig at launch).

| Attempt | Constrained by |
|---|---|
| Drain capital via emergency withdrawal | `requestEmergencyWithdrawal` → `EmergencyWithdrawalRequested` event → 48h `EMERGENCY_DELAY` → `executeEmergencyWithdrawal`. LPs and external observers see the request and have 48 hours to withdraw their own positions. |
| Upgrade pool to a malicious implementation | `_authorizeUpgrade` is `onlyOwner`. The deploy pipeline checks `storage-layout-baseline.json` and aborts on any non-appending change, blocking the obvious "swap implementation to drain funds" path. Even with an upgrade, the new implementation must be deployed and the upgrade tx is publicly observable before LPs need to react. |
| Single-tx ownership grab from a leaked old key | `Ownable2Step` requires `acceptOwnership()` from the new owner — single-key transfer attacks fail. |
| Adjust tier fees, rules, or signer set to extract value | Owner can update `challengeTierFee`, `setDefaultRules`, `addSigner` etc. These changes do not affect already-registered challenges (rules are snapshotted at registration) and are publicly logged. No path to retroactive rule change. |
| Disable `paused` indefinitely after malicious pause | `unpause` is `onlyOwner`, but `pause` itself is callable by either owner or guardian. The pause asymmetry means a single compromised guardian can stop the protocol but cannot keep it stopped past governance action. |

**Residual.** A complete owner-key compromise can attempt an
emergency withdrawal; the 48-hour timelock is the LP's defence
window. Future migration to a `CFGGovernor` + `Timelock`
(§18, Q3 2026) extends this from a 2-of-2 multisig to
token-weighted governance.

## F · External attacker (no privilege)

**Capability.** Any address with no protocol-level role.

| Attempt | Constrained by |
|---|---|
| Reentrancy into state-changing functions | OpenZeppelin `ReentrancyGuard` on every public state-changing entry point. |
| Manipulate state during a pause | `whenNotPaused` modifier blocks deposit / withdraw / claim / register paths during pause. Owner config calls remain available for incident response. |
| Drain funds via smart-contract bug | Mitigated by audit posture: AI audits finalised, full third-party audit in progress (§17). The protocol's surface is a single core contract — concentration is deliberate to make this mitigation tractable. |
| Front-run a profit claim to extract LP yield | `claimProfit` operates only on the calling LP's `rewardDebt` and balance — there is no MEV-extractable state in the call. |

**Residual.** Smart-contract risk is the load-bearing mitigation
gap until the third-party audit publishes. TVL caps are
operationally enforced during the pre-audit phase to bound
exposure.
