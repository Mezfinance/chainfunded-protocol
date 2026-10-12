# LP Yield and Returns Explained

This article explains how LP returns are calculated, when they accrue, and how to maximise your yield as a ChainFunded liquidity provider.

---

## Revenue sources

The LP pool earns from two on-chain sources:

### 1. Evaluation fees
Every time a trader starts a challenge, they pay an evaluation fee in USDC. **6% of each fee** goes directly to the LP profit pool at the time of payment.

| Account Size | Evaluation Fee | LP Share (6%) |
|-------------|---------------|--------------|
| $10,000 | $155 | $9.30 |
| $25,000 | $250 | $15.00 |
| $50,000 | $345 | $20.70 |
| $100,000 | $540 | $32.40 |
| $200,000 | $1,080 | $64.80 |

### 2. Firm cuts from payouts
When a funded trader requests a payout, 80% goes to the trader and 20% goes to the LP pool.

**Example:** A funded trader earns $8,000 profit on a $100,000 account and requests a payout.
- Trader receives: $6,400 (80%)
- LP pool receives: $1,600 (20%)

---

## How returns accumulate

Returns do not inflate the CFND token price — they accumulate in a **separate profit pool**. This design keeps accounting transparent:

- Depositing 1,000 USDC always gives 1,000 CFND
- Withdrawing 1,000 CFND always returns 1,000 USDC (your principal)
- Accumulated yield is claimed separately via the **Claim Profits** action

You can claim profits at any time without withdrawing your principal.

---

## Your share of returns

Your yield share = (Your CFND balance ÷ Total CFND supply) × Period returns

Returns are calculated and claimable at any time — there is no distribution schedule. The profit pool accumulates continuously as fees are paid and payouts are processed.

**Example:**
- You hold 10,000 CFND
- Total CFND supply: 200,000
- Your share: 5%
- LP pool earns $20,000 in a month
- Your claimable yield: $1,000

---

## Timing matters

Your share is calculated from your **current CFND balance** at the time you claim. Returns that accrued before you deposited are not claimable. Returns that accrue after you withdraw are not claimable.

To maximise yield, deposit USDC early in periods of high challenge volume (when evaluation fees are high) and hold CFND while the pool earns.

---

## No lock-up, no compounding

There is no automatic compounding of yield. Claimed profits are sent directly to your wallet as USDC. If you want to compound, you can manually re-deposit the claimed USDC to receive more CFND.

---

## Related guides

- [How to Deposit as an LP →](./02-deposit.md)
- [How to Withdraw LP Capital and Claim Profits →](./03-withdraw-claim.md)
- [LP Dashboard: UI Reference →](./05-lp-dashboard-reference.md)
