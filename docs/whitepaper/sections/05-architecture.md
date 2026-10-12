# Architecture

The protocol consists of two on-chain components and two off-chain
components. The on-chain components are `ChainFundedPool` (the
UUPS-proxied core, deployed once and upgraded in place) and a small
satellite set: `CFNDToken` (the LP share ERC-20, owned by the
pool) and the canonical Circle USDC ERC-20. The off-chain
components are the trading engine (which provides the simulated
trading environment and computes per-trader P&L) and the payout
signer set (an authorised set of EOAs that produce ECDSA
signatures over EIP-712 typed messages required by `claimPayout`,
`registerPhase2`, `registerFunded`, and `registerPostPayout`).

`ChainFundedPool` is the only contract that holds protocol funds.
`CFNDToken` is restricted such that `mint` and `burn` are only
callable by `Ownable.owner()`, which is set to the pool's address
at deployment time.

Mainnet contract addresses are listed on the cover page. The pool
proxy at `0xfbdc…83fc` is the canonical entry point — anything
that holds USDC, mints / burns `CFND`, or settles a payout
originates there.

## Storage layout

`ChainFundedPool` inherits, in order, from
`Ownable2StepUpgradeable`, `ReentrancyGuard`,
`PausableUpgradeable`, and `UUPSUpgradeable`. The inheritance order
is fixed by the storage-layout baseline; reordering bases would
shift slot offsets and corrupt persisted state on upgrade.

New state variables are appended at the end of the storage block
across upgrades — each new slot is positioned after the last
existing one and before any event declarations, where it cannot
collide with state inherited from the OZ base contracts.

`contracts/storage-layout-baseline.json` records the layout of the
deployed implementation. The deploy script compares the
to-be-deployed implementation's layout to the baseline and aborts
on any non-appending change.

## Upgrade authorisation

`_authorizeUpgrade(address newImplementation)` is `onlyOwner`. The
pool owner is held by a 2-of-2 governance multisig at launch
(ChainFunded Labs key + an independent guardian key). An emergency
withdrawal path (`requestEmergencyWithdrawal` →
`executeEmergencyWithdrawal`) is timelocked at `EMERGENCY_DELAY =
48 hours`, providing a window during which LPs may observe a
pending withdrawal and withdraw their own positions before
execution.

## Off-chain trust assumptions

- The trading engine is trusted to compute per-trader P&L
  honestly. A trading-engine fault that overstates a trader's
  profit produces an attested P&L that the on-chain check (which
  only re-evaluates rules, not raw trade execution) cannot
  detect. Mitigation is in operational engineering: independent
  signer environments, log retention, and post-hoc audit.
- Each signer is trusted to refuse to sign a proof for a breached
  account. Compromise of fewer than `signatureThreshold` signers
  is not sufficient to forge a valid proof. Compromise of
  `signatureThreshold` or more signers does not produce a valid
  payout for a rule-breached account because the on-chain check
  fails independently (§4, §11).

## Diagram

![Figure 1 · Contract topology](contract-topology.svg)
