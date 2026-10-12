# NAV mechanics

The CFND net asset value is computed deterministically from
public pool state at any block:

```
NAV(t) = ( totalUSDC(t) − profitPoolBalance(t) ) / cfndTotalSupply(t)
```

where `totalUSDC(t)` = `IERC20(USDC).balanceOf(pool)` at block t,
`profitPoolBalance(t)` = `pool.profitPoolBalance()`, and
`cfndTotalSupply(t)` = `cfndToken.totalSupply()`.

Excluding `profitPoolBalance` from the numerator is the
mechanical guarantee of `claimProfit` NAV-neutrality:
`claimProfit` debits both the pool's USDC balance and the
profit pool by the same amount, so the ratio is invariant.

## Operations that change NAV

| Operation | NAV impact | Mechanism |
|---|---|---|
| `registerChallenge` | NAV ↑ by the LP-capital share of the fee | LP-capital share = `feeAmount × (BPS − FEE_PROTOCOL_BPS − FEE_PROFIT_POOL_BPS − affiliateRateBps) / BPS`. For an unreferred trade at default constants this is 70% of the fee. |
| `claimPayout` (trader share) | NAV ↓ by `traderShare` | `traderShare` is transferred out of the pool's USDC balance; LP capital reserve = `totalUSDC − profitPool` decreases. |
| `claimPayout` (LP-yield slice of firm cut) | NAV ↑ by 20% of firm cut | This slice credits the profit pool, not capital, so it cancels out of the NAV numerator (numerator unchanged) — but `totalUSDC` rises, so the numerator's preserving property holds without exception. |

Aggregated over time, NAV is a martingale on (cumulative
challenge fees + firm-cut LP slice − cumulative trader payouts).
For periods in which the sum is positive, NAV monotonically
appreciates. For periods in which it is negative, NAV
depreciates — bounded below by `0` because the pool cannot
transfer more USDC than it holds. `claimPayout` reverts with
`InsufficientLPCapital` if the requested `traderShare` exceeds
`lpCapitalBalance() = totalUSDC − profitPool`.

## Worked examples

The relationship between `totalUSDC`, `profitPool`, NAV, and per-CFND
yield is easiest to see with concrete numbers. Both scenarios assume
`cfndTotalSupply = 1,000,000 CFND`.

**Healthy state.** Pool has accrued fees beyond the original LP
deposits, with $50,000 of that earmarked as LP yield:

```
totalUSDC        = $1,050,000
profitPool       =    $50,000
lpCapitalBalance = $1,000,000   (totalUSDC − profitPool)
NAV              =    $1.00     ($1M / 1M CFND)
profit per CFND  =    $0.05     ($50k / 1M CFND)
total claim/CFND =    $1.05     (NAV + earned yield)
```

NAV is unchanged from launch — LP *capital* is whole. The $0.05
per CFND of yield sits in the profit pool and is claimable via
`claimProfit()` without moving NAV (both numerator and denominator
of the NAV equation are independent of the profit-pool
withdrawal).

**Stress state.** A large funded-trader payout has eaten into LP
capital faster than fees have replenished it:

```
totalUSDC        = $1,000,000
profitPool       =    $50,000
lpCapitalBalance =   $950,000
NAV              =    $0.95     ($950k / 1M CFND)
profit per CFND  =    $0.05
total claim/CFND =    $1.00     (NAV + earned yield = breakeven)
```

NAV has depreciated; LP capital backing per CFND is below $1.
The accumulated yield brings each CFND back to breakeven on a
total-claim basis, but withdrawing capital now would crystallise
the NAV loss. This is the trader-PnL exposure LPs underwrite by
participating in the pool.

## Diagram

![Figure 5 · CFND NAV over time — illustrative](nav-over-time.svg)

## Properties

- **NAV is observable.** Any participant can compute current
  NAV from `IERC20(USDC).balanceOf(pool)`,
  `pool.profitPoolBalance()`, and `cfndToken.totalSupply()`
  using a single multicall.
- **NAV is monotone in fee inflows.** A `registerChallenge`
  call cannot decrease NAV; a successful `claimPayout` cannot
  increase it (the LP-yield slice credits a profit-pool slot
  outside the NAV numerator).
- **NAV does not encode unrealised trader P&L.** Because trade
  execution is off-chain (§6), the pool has no view of unsettled
  funded-trader gains until `claimPayout` is invoked. NAV
  reflects only on-chain state: the protocol's actual USDC
  balance net of LP yield earmarks, divided by the supply of
  CFND.

LPs are taking a long position on the aggregate distribution of
trader outcomes net of fee revenue and firm cuts. The exposure
is denominated in USDC and computable from public state at every
block. There is no contract-side mechanism that obscures this
exposure.
