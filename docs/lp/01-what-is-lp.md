# What is Liquidity Providing on ChainFunded?

Liquidity Providers (LPs) supply the USDC pool that backs trader payouts on ChainFunded. In return, LPs earn a share of evaluation fees and firm cuts from winning traders. There is no lock-up period — deposit and withdraw at any time.

---

## Why LPs are needed

When a funded trader requests a payout, the smart contract sends USDC directly from the liquidity pool to the trader's wallet. LPs are the source of that capital. Without LP deposits, payouts cannot be funded.

---

## How LP returns are generated

LPs earn from two revenue streams:

| Source | Amount |
|--------|--------|
| Evaluation fees (per challenge started) | 6% of each fee |
| Firm cut from funded trader payouts | 20% of each payout |

**Example:**
- A trader pays a $345 evaluation fee → LPs earn $20.70 collectively
- A funded trader earns $5,000 profit and requests a payout → $1,000 (20%) goes to the LP pool

Returns are accumulated in a separate **profit pool** and can be claimed at any time.

---

## LP tokens (CFND)

When you deposit USDC, you receive **CFND tokens** in return, minted 1:1 (1 USDC deposited = 1 CFND received). CFND represents your proportional share of the pool.

- NAV per CFND = $1.00 (fixed — the token does not inflate in price)
- Returns accumulate separately in the profit pool, not in the token value
- When you withdraw, you burn CFND and receive USDC back at 1:1

---

## Your share of returns

Your share of the profit pool is proportional to your CFND holdings relative to the total CFND supply.

**Example:** The pool has 100,000 CFND total. You hold 10,000 CFND (10% of the pool). If the pool earns $5,000 in a week, your share is $500 (10%).

---

## Risk considerations

LPs take on the risk of funding trader payouts. If a large number of traders pass challenges and request payouts simultaneously, the pool absorbs those costs. The evaluation fee revenue and firm cuts from payouts are designed to be the primary sources of return — the pool does not pay out more than it earns.

There is no lock-up period, so LPs can withdraw at any time. However, withdrawals are processed at the current pool NAV, which may be lower if outstanding payout obligations are large.

---

## Related guides

- [How to Deposit as an LP →](./02-deposit.md)
- [How to Withdraw LP Capital and Claim Profits →](./03-withdraw-claim.md)
- [LP Yield and Returns Explained →](./04-lp-yield-explained.md)
- [LP Dashboard: UI Reference →](./05-lp-dashboard-reference.md)
