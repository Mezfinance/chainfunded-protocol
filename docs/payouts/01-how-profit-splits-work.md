# How Profit Splits Work

On a funded ChainFunded account, you keep **80% of your profits**. The remaining 20% is retained by the platform as the firm cut, which flows to the LP pool.

---

## The split

| Party | Share |
|-------|-------|
| Trader | 80% |
| ChainFunded (firm cut → LP pool) | 20% |

**Example:** You make $10,000 profit on a $100,000 funded account. You receive $8,000 USDC. The LP pool receives $2,000 USDC.

---

## What counts as profit

Profit is calculated as your **funded account equity minus your starting balance** at the time of the payout request.

- Starting balance = the account size you were funded with (e.g. $50,000)
- Profit = Current equity − Starting balance
- Only positive profit can be withdrawn

If you have open positions when you request a payout, their unrealised P&L is included in the equity calculation. Close all positions before requesting a payout to ensure the amount shown is accurate.

---

## When can you request a payout?

You can request a payout at any time after passing Phase 2 and activating your funded account, as long as your equity is above the starting balance.

There is no minimum wait period and no payout schedule. You can request a payout daily if you choose.

Note: After a payout, your funded account balance resets to the starting balance. Any subsequent profits can be paid out in a future request.

---

## How payouts are processed

All payouts are processed by the ChainFunded smart contract. When you request a payout:

1. You sign a message in your wallet (no gas fee at this step)
2. The smart contract verifies your Phase 2 pass status and the profit amount
3. The contract sends **80% of your profit in USDC** directly to your wallet address
4. The transaction is recorded on Etherscan and visible to anyone

There is no manual approval, no withdrawal queue, and no company custodying your funds. The entire process takes 30–90 seconds.

---

## Phase 1 and Phase 2 accounts

The profit split only applies to **funded accounts** (after passing Phase 2). There are no payouts during Phase 1 or Phase 2 evaluation accounts — those are simulated accounts.

---

## Related guides

- [How to Request a Payout →](./02-request-payout.md)
- [Payout History and Status →](./03-payout-history-and-status.md)
- [What is Liquidity Providing? →](../lp/01-what-is-lp.md)
