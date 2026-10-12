# Roadmap

## Q2 2026 — mainnet

- `ChainFundedPool` UUPS proxy deployment to Ethereum mainnet
- AI-driven security reviews finalised; third-party audit in
  progress
- Signer set initialised at `M = 5`, `signatureThreshold = 3`

## Q3 2026 — audit, governance handover, APAC

- Third-party audit publication
- Operational TVL caps relaxed contingent on audit closure
- Affiliate ladder activated via `setAffiliateTiers` with
  on-chain referral attribution
- **Governance handover** — pool owner transfer from the launch
  2-of-2 multisig to a Timelock-controlled governance contract
  via `Ownable2Step` (`transferOwnership` + `acceptOwnership`).
  Stage-1 governance is a Timelock + admin multisig pending CFG
  activation; Stage-2 swaps the admin role for `CFGGovernor`
  once the Q4 exchange launch puts CFG into circulation
- **CFG token contract deployed** alongside the governance
  Timelock. The token is on-chain but non-tradeable until Q4 —
  no liquidity, no exchange listings, vesting and distributor
  contracts paused
- **Singapore (APAC) customer service office** stood up to
  cover APAC trading hours, signer monitoring, and on-shore
  participant support. Off-chain function only — no contract
  surface change

## Q4 2026 — CFG exchange launch

- **CFG public exchange listings** — token enters circulation
  via initial CEX / DEX listings (separate publication —
  see [chainfundeddao.org](https://chainfundeddao.org))
- Vesting and distribution contracts activated against the
  now-circulating supply
- **`CFGGovernor` activation** — voting takes over from the
  admin multisig per Stage-2 of the Q3 handover. From this
  point, pool-owner state changes are gated by token-weighted
  on-chain votes through the existing Timelock

## 2027 — multi-asset

- Multi-asset collateral evaluation — adding additional stable
  collaterals expands contract surface and per-asset risk
  surface; subject to its own audit cycle and a separate
  amendment to this paper

---

# References

- ChainFunded protocol source ·
  [github.com/Mezfinance/ChainFunded](https://github.com/Mezfinance/ChainFunded)
- ChainFunded DAO documentation ·
  [chainfundeddao.org](https://chainfundeddao.org)
- OpenZeppelin Contracts (v5) — `Ownable2StepUpgradeable`,
  `PausableUpgradeable`, `ReentrancyGuard`, `UUPSUpgradeable`,
  `SafeERC20`, `ECDSA`, `MessageHashUtils`
- EIP-712 — typed structured data hashing and signing
- ERC-20 — fungible token standard (USDC, CFND)
- Sushi MasterChef — per-token reward accumulator pattern used
  by `accProfitPerToken` / `rewardDebt`

---

# Disclosures

ChainFunded is software. It is not a regulated financial
product and this document is not investment advice. Trading
evaluation accounts is high-risk; participants may lose the
fees they pay.

The protocol is in an early operational phase. TVL caps,
signer-set parameters, fee splits exposed via constants,
challenge tier prices, and governance topology may change with
operational decision or DAO action. The on-chain source is the
canonical specification; this document describes the protocol
as deployed at the version stated on the cover.

Participants should review the on-chain contract source
directly before participating, and should consult their own
counsel where applicable. Past performance of the simulated
trading environment, of the LP profit pool, or of any
referenced third-party prop firm is not predictive of future
outcomes.
