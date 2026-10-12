# The problem

The retail proprietary-trading subclass that emerged in the
2020–2024 cycle operates on a fixed structural template: the
trader pays an evaluation fee to access a simulated trading
account governed by a written rule set, the firm attests
performance through internal systems, and — conditional on a
passing run — the firm settles a profit-share to the trader
either as fiat off-platform or as account credit. Every
state-changing operation in this loop is private to the firm:
the simulated account ledger, the rule-evaluation engine, the
profit calculation, the funding decision, and the eventual
settlement transfer.

This template produces three identifiable failure modes that
are enumerable from public regulatory and litigation records.

## 1 · Settlement is discretionary

The firm controls both the function and the timing of payout.
Industry-public class-action filings (US 2024 — `My Forex Funds`
proceedings; UK 2024 FCA action against multiple
"funded-trader" providers; AU 2025 ASIC enforcement notices)
document a recurring sequence: post-evaluation account closure
on rule clauses ambiguously specified at registration, payout
delays attributed to "compliance review", and retroactive
profit-split renegotiations. The trader's leverage is
contractual at best and frequently substandard against the
firm's terms-of-service unilateral-amendment provisions.

## 2 · Capital is unverifiable

The LP base of a traditional firm is its principals plus a
small private syndicate. Capital balances, segregation, and
profit-and-loss are not externally auditable. The firm's
rational behaviour with respect to disclosure is asymmetric:
overstate capital to attract challenge buyers, understate
realised P&L to suppress payout obligations. Public regulator
filings have repeatedly identified this asymmetry; multiple
firms shut down in 2024–2025 cited insufficient working capital
to honour outstanding payouts at the moment of regulatory
intervention.

## 3 · Regulatory perimeter is unstable

Whether a "funded-trader evaluation" with prospective
profit-share constitutes an unregistered investment-contract
offering is unsettled across the major financial-services
jurisdictions. 2024–2025 enforcement actions in the US, UK, and
Australia have produced inconsistent remedies — in some cases
fee refunds, in others account-balance freezes pending
adjudication. The trader's exposure to this regulatory tail is
uncompensated and unhedgeable on the firm's existing terms.

## What an on-chain protocol changes

The three failure modes share a structural property: the firm's
state changes are mediated by software the firm operates
unilaterally. ChainFunded relocates each state change to a
deterministic on-chain function with a public source. Settlement
is a function call against `ChainFundedPool` (§4, §11). LP
capital is `IERC20(USDC).balanceOf(pool)` minus the LP profit
pool, computable at any block. The protocol's surface is bounded
by the deployed contract — there is no separate "internal
system" that holds material state.

This does not eliminate the regulatory question, which is
external to the contract; it does eliminate the discretion and
opacity that compound the regulatory exposure for an aggrieved
participant.
