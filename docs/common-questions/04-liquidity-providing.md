# Common Questions: Liquidity Providing

---

**What is the minimum LP deposit?**

There is no enforced minimum. You can deposit as little as 1 USDC. In practice, gas fees for the two required transactions (USDC approval + deposit) make very small deposits uneconomical.

---

**Is there a lock-up period for LP deposits?**

No. You can withdraw your USDC at any time by burning your CFND tokens. There is no lock-up period, vesting schedule, or early withdrawal penalty. Withdrawals are processed in a single on-chain transaction.

---

**How is my share of LP returns calculated?**

Your yield share is proportional to your CFND holdings relative to total supply:

```
Your yield = (Your CFND ÷ Total CFND supply) × Period returns
```

Returns are continuous — there is no distribution schedule or snapshot date. The profit pool accumulates as evaluation fees are paid and trader payouts are processed.

**Example:** You hold 10,000 CFND out of 200,000 total (5% of the pool). If the pool earns $20,000 in a month, your claimable yield is $1,000.

---

**Can I claim yield without withdrawing my principal?**

Yes. Select **Claim Profits** on the LP Dashboard. Your accumulated yield is sent to your wallet in USDC while your CFND tokens (principal) remain in the pool and continue earning.

---

**What happens to unclaimed yield if I withdraw my principal?**

Unclaimed yield is not automatically included in a withdrawal transaction. Claim your profits first, then withdraw. If you withdraw without claiming, the unclaimed yield remains associated with your address and can be claimed separately — but confirm the current behaviour in the LP Dashboard before withdrawing.

---

**Related guides**

- [What is Liquidity Providing? →](../lp/01-what-is-lp.md)
- [How to Deposit as an LP →](../lp/02-deposit.md)
- [How to Withdraw LP Capital and Claim Profits →](../lp/03-withdraw-claim.md)
- [LP Yield and Returns Explained →](../lp/04-lp-yield-explained.md)
