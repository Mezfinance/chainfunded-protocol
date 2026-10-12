# CFG token & DAO

The CFG governance token, vesting schedule, distribution
contracts, governance configuration, and treasury topology are
out of scope for this document. They are the subject of a
separate publication maintained at
[chainfundeddao.org](https://chainfundeddao.org).

The boundary is drawn deliberately: this document specifies the
deterministic on-chain behaviour of `ChainFundedPool` and its
satellites. Token-economic parameters and governance state are
mutable under DAO action and have a different cadence of
revision than the protocol surface itself.

## Pointer

The DAO documentation covers, at minimum:

- `CFGToken` — supply, vesting cliffs, initial mint distribution
- `CFGVesting` — per-recipient vesting contracts (founder,
  contributor, investor)
- `CFGDistributor` — trader-rewards programme: CFG distributed
  per registered challenge, sourced from a fixed allocation
- `CFGLPRewards` — LP staking: CFND staked → CFG yield + USDC
  profit-pool yield via the whitelisted `transferCfnd` path
- `CFGGovernor` + `Timelock` — voting, proposal threshold,
  voting delay, voting period, execution delay
- Treasury composition, signer topology, and on-chain spend
  reporting

→ [chainfundeddao.org](https://chainfundeddao.org)

## What this means for protocol-only readers

A reader who only requires the protocol's settlement and LP
mechanics does not need to read the DAO publication. The
protocol contracts are not dependencies of CFG; CFG-side
contracts are dependencies of the protocol only via
`cfndTransferWhitelist` (granting `CFGLPRewards` permission to
move CFND on behalf of stakers). The grant is reversible by
`setCfndTransferWhitelist(addr, false)`; the protocol continues
to function with the whitelist empty.
