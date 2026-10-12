# LP mechanics

A liquidity provider deposits USDC into `ChainFundedPool` and
receives `CFNDToken` (`CFND`) — an ERC-20 share token whose
balance encodes a pro-rata claim against (i) the pool's LP
capital reserve and (ii) the per-CFND share of the LP profit
pool. `CFND` is owned and minted exclusively by the pool;
`mint(to, amount)` and `burn(from, amount)` are restricted to
`Ownable.owner()` which is set to the pool's address at
deployment.

## Deposit

```
USDC.approve(pool, amount)
pool.deposit(amount, gasReimbursementUsdc)
```

The pool pulls `amount` USDC, mints `amount` CFND to the LP
(1:1 at NAV), and updates `lastDepositBlock[lp] = block.number`.
The `lastDepositBlock` mapping is consulted by `withdraw`:
withdrawals from the same block as the depositor's most recent
deposit revert with `SameBlockDeposit`. This blocks the
deposit-then-withdraw flash pattern that would otherwise
permit a same-block round-trip through the per-CFND profit
accumulator.

Reverts: `InvalidAmount` (`amount == 0`),
`PoolMustHaveDeposits` (n/a — first deposit creates the
deposit-pool invariant; this revert is on `registerChallenge`
when the pool has zero LPs).

## Yield accrual

Two USDC streams accrue to the LP profit pool, separately from
the LP capital reserve:

- `(feeAmount * FEE_PROFIT_POOL_BPS) / BPS = 6%` of every
  challenge fee credited at `registerChallenge`.
- `(firmCut * (BPS - FIRM_CUT_PROTOCOL_BPS)) / BPS = 20%` of
  every funded-trader payout firm cut credited at `claimPayout`.

The pool tracks this credit via `accProfitPerToken` — a
fixed-point per-token accumulator updated whenever the profit
pool gains or loses USDC. Each LP carries `rewardDebt[lp]` =
`balance × accProfitPerToken` at the time of their last
state-changing operation (deposit, withdraw, claim,
`transferCfnd`). Pending profit at any time is:

```
pendingProfit(lp) = balance(lp) × accProfitPerToken − rewardDebt(lp)
```

This is the per-share-accumulator pattern used in MasterChef
and its derivatives; it is `O(1)` per claim and exact under
fixed-point arithmetic.

## Claim profit

```
pool.claimProfit(gasReimbursementUsdc)
```

Transfers `pendingProfit(msg.sender)` USDC to the LP and
resets `rewardDebt[msg.sender]` to the new
`balance × accProfitPerToken`. CFND balance is unchanged. The
LP capital reserve is unchanged. Reverts on `NoProfitToClaim`
if `pendingProfit == 0`.

## Withdraw capital

```
pool.withdraw(cfndAmount, gasReimbursementUsdc)
```

Burns `cfndAmount` CFND from the LP and transfers
`cfndAmount × NAV` USDC. The function first auto-claims any
pending profit (so `claimProfit` is not required as a
prerequisite), then computes and transfers the capital share at
the current NAV. Reverts: `InsufficientCFND`
(`balance < cfndAmount`), `NoCapitalAvailable`
(`lpCapitalBalance() == 0`), `SameBlockDeposit`
(`lastDepositBlock[lp] == block.number`).

## Diagram

![Figure 4 · LP lifecycle](lp-lifecycle.svg)
