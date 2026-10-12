# Risk surface

This section enumerates the protocol's risk surface by carrier:
the trader, the LP, and shared risks borne by both via the
contract.

## Trader risk

| Risk | Mitigation / mechanism |
|---|---|
| Maximum monetary loss bounded to `feeAmount` | Simulated trading P&L cannot inflict additional cash loss. There is no on-chain margin or collateral call against the trader beyond the fee paid at `registerChallenge`. |
| Payout liveness — N signers must be online | N-of-M = 3-of-5 at launch tolerates two simultaneous outages. A funded trader's signed payout proof is valid until its `deadline`; signers may produce a proof at any time within the window without the trader losing standing. |
| Trading-engine fault that mis-records P&L | Out of scope of on-chain re-verification. Mitigation is operational: independent signer environments cross-check P&L derivations off-chain. A trading-engine fault that overstates trader profit produces an attested P&L the contract cannot detect. |

## LP risk

| Risk | Mitigation / mechanism |
|---|---|
| NAV depreciation below 1.00 | Cumulative trader payouts that exceed (cumulative challenge fees + firm-cut LP slice) reduce LP capital. Bounded by `lpCapitalBalance() ≥ 0`; `claimPayout` reverts with `InsufficientLPCapital` once reserves are exhausted. |
| Withdrawal contention | All LP withdrawals draw from the shared USDC reserve. Concurrent large withdrawals near a pending payout can cause `claimPayout` to revert until fresh fees flow in. This is queue contention rather than insolvency, but is observable as payout latency. |
| Smart-contract risk on UUPS upgrade | `_authorizeUpgrade` is `onlyOwner`. Owner is a 2-of-2 multisig at launch (Labs + independent guardian). An emergency withdrawal by the owner is gated by `EMERGENCY_DELAY = 48 hours`. See §17. |
| Same-block deposit / withdraw cycling | Blocked by `lastDepositBlock[lp] == block.number` check on `withdraw`, reverting `SameBlockDeposit`. |

## Shared risk

| Risk | Mitigation / mechanism |
|---|---|
| USDC peg break or Circle blacklist of pool address | The pool supports only USDC. A peg break or address-level blacklist halts protocol functionality. Concentration is deliberate: supporting multiple stable assets would multiply contract surface and per-asset risk-management complexity. |
| Regulatory action against trader-evaluation accounts | External to the protocol. Jurisdictional access to the in-app trading engine is operational and may change. The on-chain protocol itself is permissionless to read and call; it cannot be unilaterally taken offline by a single jurisdiction. |
| Multi-signer compromise | A `signatureThreshold`-or-more compromise produces a valid signature aggregate. The on-chain re-verification (§4, §11) catches false rule attestations independent of signature validity; it does not catch a false P&L attestation that does not breach any rule. Mitigation in signer key-management: HSM custody, geographically distributed signing environments, post-hoc audit. |
| Owner key compromise | Owner is `Ownable2Step` — transfers require `acceptOwnership` from the new owner, blocking single-tx transfer attacks. The 48-hour emergency-withdrawal timelock provides a window during which a malicious owner action can be observed and LPs can withdraw. |
