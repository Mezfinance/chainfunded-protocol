# ChainFunded

**An on-chain prop-trading evaluation platform**

> *A prop firm whose payout function is a smart contract cannot choose not to pay a passing trader.*

---

## TL;DR

ChainFunded turns retail prop-firm evaluations into deterministic
on-chain settlement. Traders pay USDC evaluation fees, trade
simulated capital across two phases, and — if they pass without
breaching any rule — receive automatic on-chain payouts from a
pooled liquidity reserve. Liquidity Providers deposit USDC, mint
`CFND` share tokens at 1:1 NAV, underwrite the trader-PnL spread,
and earn yield from challenge fees and funded-trader firm cuts.
The payout function is permissionless, re-verifies every rule
on-chain against the parameters snapshotted at registration, and
either transfers USDC or reverts. There is no admin path that
bypasses the verification.

---

## Document metadata

**Version** 1.0

**Date** 2026-05

**Authors** ChainFunded Labs

**Canonical URL** [chainfunded.com/whitepaper](https://chainfunded.com/whitepaper)

**Source code** [github.com/Mezfinance/ChainFunded](https://github.com/Mezfinance/ChainFunded) · [contracts/contracts/](https://github.com/Mezfinance/ChainFunded/tree/main/contracts/contracts)

**Deployment** Ethereum mainnet · `ChainFundedPool` UUPS proxy

**Status** AI audits finalised · full third-party audit in progress

---

## Mainnet contract addresses

| Contract | Address |
|---|---|
| `ChainFundedPool` (UUPS proxy) | `0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc` |
| `Timelock` (governance) | `0xdc7f1d4e9bffa8739f4b0b173700f599f7eb3ac4` |
| `CFGToken` | `0xde56217645c54f00258826f944f772117aca041b` |
| `CFGGovernor` | `0x4e8637ada57187524e30efbedd55b706f9c8be50` |
| `CFGDistributor` | `0x0576ff8c9291bf58c9c6a6a9623b98f05b913904` |
| `CFGLPRewards` | `0x0b5072a88454fa1553787bfd9cbfbe346f7d0edd` |

Verify any address on [Etherscan](https://etherscan.io) before
interacting. The pool address is the canonical entry point —
every other on-chain interaction either originates from the pool
or reads from it (§5).
