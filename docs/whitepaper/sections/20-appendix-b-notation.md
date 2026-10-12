# Appendix B · Notation reference

A glossary of the typed conventions the document and the
contracts use. Grep aid for readers cross-referencing the
on-chain source.

## Units

| Unit | Meaning |
|---|---|
| `USDC` | Circle USD Coin, 6 decimals on Ethereum mainnet. Every USDC figure in this paper is in human units (`$50.00`); on-chain the same value is `50_000_000` (`50 * 10^6`). |
| `BPS` (basis points) | One ten-thousandth of a whole. `BPS = 10_000` is the contract constant. `2400 BPS = 24%`. Percent-of-percent calculations multiply BPS values then divide by `BPS`. |
| `seconds` | Unix timestamp, no time zone. `block.timestamp` is the canonical clock for `deadline` checks. |
| `wei` | Solidity native — used only for ETH gas reimbursement amounts (`gasReimbursementUsdc` is in USDC units, not wei). |

## Identifier conventions

| Convention | Example | Where used |
|---|---|---|
| `UPPER_SNAKE_CASE` | `FEE_PROTOCOL_BPS`, `FEE_PROFIT_POOL_BPS`, `EMERGENCY_DELAY` | Solidity `constant` and `immutable` values. Implementation-fixed; changing requires a UUPS upgrade. |
| `camelCase` | `traderShareBps`, `accountId`, `gasReimbursementUsdc` | Function parameters and local variables. |
| `camelCase` (state) | `labsWallet`, `signatureThreshold`, `accProfitPerToken` | Public storage variables. Readable from any block via the auto-generated getter. |
| `camelCase()` | `claimPayout()`, `claimProfit()`, `registerChallenge()` | Function references. Parentheses indicate this is a function, not a state slot. |
| `accountId` (24-char string) | `"a1b2c3d4e5f6789012345678"` | All challenge identifiers. Length is enforced (`bytes(accountId).length == 24`) at registration. |
| `payoutId` (variable string) | any non-empty string | Per-payout replay-protection key. Set by the backend, length-unconstrained, must be unique per `claimPayout`. |
| `bytes32 indexed` | event topic | Indexed event field — searchable on Etherscan via log filter. |

## Math / formula style

| Style | Example | Use case |
|---|---|---|
| Code-block formula | `NAV = (totalUSDC − profitPool) / cfndTotalSupply` | Core protocol formulas. Always uses the on-chain state names. |
| Inline backtick | `(feeAmount × FEE_PROTOCOL_BPS) / BPS = 24%` | Per-line ratio derivations inside prose. |
| Table row | tier · rate · destination | When a formula has more than two parameters or branches by condition. |
| Comparison operators | `≥` `≤` `=` `>` `<` | Standard Unicode, not the ASCII `>=` etc. |

## Cross-reference style

| Form | Meaning |
|---|---|
| `§N` | Section N of this paper (e.g. `§11` = Payout enforcement). |
| `Fig. N` | Figure N (e.g. `Fig. 6` = fee split diagram). |
| `(§4, §11)` | Multiple section references inside a parenthetical. |
| `[link text](url)` | External link, always rendered in primary green. |

## Token symbols

| Symbol | Spelling | When in backticks |
|---|---|---|
| **USDC** | bold, no backticks in prose; `USDC` with backticks when referring to the contract identifier or an `IERC20(USDC)` cast |
| **CFND** | bold in prose, `CFND` in backticks when referring to the `CFNDToken` contract or the symbol as a code identifier |
| **CFG** | bold in prose, `CFGToken` in backticks for the contract |
| **ETH** | bold in prose, never in backticks — never used as a code identifier |

## Address style

| Form | Meaning |
|---|---|
| `0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc` | Full mainnet address, lowercased for hash-friendliness. |
| `0xfbdc…83fc` | Truncated address — first 6 + last 4 chars, joined by an ellipsis. Used in prose where the full address would be visually heavy. |
| `address(0)` | The zero address. Used in contract conditions like `if (affiliate != address(0))`. |

## Error names

Custom errors are referenced inline as bare identifiers — e.g.,
`RuleBreachedDailyLoss`, `PayoutAlreadySettled`,
`InsufficientSignatures`. They are not prefixed with the contract
name; the contract context is implicit from the calling function
referenced in the same sentence.

The complete list of errors is in
`contracts/contracts/ChainFundedPool.sol` lines 149–213.
