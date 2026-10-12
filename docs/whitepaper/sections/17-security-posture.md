# Security posture

The protocol's security model has four components: bounded
on-chain surface, multi-signature signer set over payout state
transitions, owner-only configuration with a 48-hour
emergency-withdrawal timelock, and append-only storage layout
across UUPS upgrades. Each is enforced in code rather than by
operational policy.

## Audit status

- **AI-driven security reviews** are finalised against the
  current implementations of `ChainFundedPool.sol`,
  `CFNDToken`, and the supporting CFG / vesting contracts.
  Findings have been remediated; the
  post-remediation codebase is the version deployed to Sepolia
  and slated for mainnet.
- **Independent third-party audit** is in progress as of
  mainnet preparation. The audit report will be published at the
  canonical URL on completion. Until then the operational
  posture is pre-third-party-audit: a TVL cap may be enforced
  operationally, and early participants are advised to size
  positions accordingly.

## Owner + multisig topology

| Role | Held by | Powers |
|---|---|---|
| Pool owner (`Ownable.owner()`) | 2-of-2 multisig (Labs key + independent guardian key) | `setChallengeTiers`, `setDefaultRules`, `setAffiliateTiers`, `addSigner` / `removeSigner`, `setSignatureThreshold`, `updateGuardian`, `updateLabsWallet`, `_authorizeUpgrade`, emergency withdrawal request / execute / cancel |
| Payout signer set | M=5 EOAs (3-of-5 threshold at launch), each in an isolated environment | Sign EIP-712 typed messages required by `claimPayout`, `registerPhase2`, `registerFunded`, `registerPostPayout` |
| Guardian | Single role, currently a Labs operational key | `pause()` (cannot `unpause`) |

The guardian/owner asymmetry is deliberate: a single
compromised guardian key can pause the protocol but cannot
unilaterally resume it. `unpause` requires owner action.

## Reentrancy + pause guards

All public state-changing entry points carry both
`nonReentrant` (OpenZeppelin's `ReentrancyGuard`) and
`whenNotPaused` (OpenZeppelin's `PausableUpgradeable`):

| Function | `nonReentrant` | `whenNotPaused` |
|---|---|---|
| `deposit` | yes | yes |
| `withdraw` | yes | yes |
| `claimProfit` | yes | yes |
| `registerChallenge` | yes | yes |
| `registerPhase2` / `registerFunded` / `registerPostPayout` | yes | yes |
| `claimPayout` | yes | yes |
| owner config (`setChallengeTiers`, `setDefaultRules`, signer mgmt, etc.) | n/a | no — callable when paused so the owner can respond to an incident |

## UUPS upgradeability

`_authorizeUpgrade(address newImplementation)` is `onlyOwner`.
Storage layout is append-only and the
`contracts/storage-layout-baseline.json` file is checked against
the to-be-deployed implementation by the deploy script. An
upgrade that would shift any existing slot fails the check and
cannot be deployed without an explicit baseline update.

## Emergency withdrawal

```
requestEmergencyWithdrawal(to, amount, isCapital)
   → emits EmergencyWithdrawalRequested with executeAfter = block.timestamp + EMERGENCY_DELAY

[ 48h elapses, observable by all participants ]

executeEmergencyWithdrawal(requestId)
   → moves USDC, emits EmergencyWithdrawalExecuted
```

`cancelEmergencyWithdrawal(requestId)` is available during the
delay window and emits `EmergencyWithdrawalCancelled`.
`EMERGENCY_DELAY = 48 hours`. The delay is the central
operational guarantee: any withdrawal request is publicly
observable for 48 hours before execution, providing LPs and
external observers a window to react — withdrawing their own
positions, alerting the community, or initiating governance
counter-action against the owner.
