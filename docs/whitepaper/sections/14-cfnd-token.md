# CFND token

`CFNDToken` is the LP share ERC-20. It is a thin wrapper over
OpenZeppelin's `ERC20` and `Ownable`; `mint(to, amount)` and
`burn(from, amount)` are restricted to `Ownable.owner()`, which
is set to `ChainFundedPool`'s address at deployment.

## Properties

| Property | Value |
|---|---|
| Symbol | `CFND` |
| Decimals | `6` (matches USDC) |
| Owner / mint authority | `ChainFundedPool` proxy address (immutable post-deployment) |
| Initial NAV | `1.00 USDC per CFND` at first deposit |
| Transfer | standard ERC-20 `transfer` and `transferFrom` |

## Whitelisted profit-aware transfer

The pool maintains `cfndTransferWhitelist` (`mapping(address =>
bool)`) for staking endpoints — `CFGLPRewards` is the canonical
example — that need to move CFND between holders while
preserving per-CFND profit-accumulator correctness. Whitelisted
endpoints call:

```
pool.transferCfnd(from, to, amount)
```

which (i) settles any pending profit for both `from` and `to`
into their respective `rewardDebt` slots, then (ii) executes the
transfer at the underlying ERC-20 layer. Direct ERC-20
`transfer` and `transferFrom` calls remain functional for
non-whitelisted endpoints but bypass the accumulator
synchronisation; staking integrations must use `transferCfnd`
to avoid stranded yield.

`setCfndTransferWhitelist(addr, enabled)` is `onlyOwner` and
emits `CfndTransferWhitelistUpdated`.

## NAV invariant

The pool enforces `cfndToken.totalSupply() > 0` at the entry
to `registerChallenge` (else `PoolMustHaveDeposits`). This rules
out the degenerate state in which a trader pays a fee into a
pool with no LP capital backing the eventual payout obligation.
The first LP deposit creates the supply and unlocks challenge
purchases; subsequent challenge fees flow into LP capital and
LP yield without affecting `totalSupply`.

`cfndTotalSupply` changes only on:

- `deposit` → `mint(to, amount)`
- `withdraw` → `burn(from, amount)`

`claimProfit` does not change supply. `claimPayout` does not
change supply. `transferCfnd` does not change supply (transfer
between holders).

## Why a fungible ERC-20 over an LP-NFT

LP positions in the pool are homogeneous: every CFND represents
the same per-unit claim on capital and the per-share accumulator.
Heterogeneous-position protocols (Uniswap V3 concentrated
liquidity, etc.) require NFT positions to encode per-position
parameters. ChainFunded's pool has no such per-position state;
fungibility is the natural fit and removes special-casing in
downstream integrations (staking, lending, secondary markets).
