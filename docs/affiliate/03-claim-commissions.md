# Affiliate Commissions: How Payments Work

ChainFunded affiliate commissions are paid automatically on-chain — there is no claim process, no minimum balance, and no withdrawal request needed.

---

## How commissions are paid

When a trader you referred pays their evaluation fee, your **tiered commission (8–20%) is sent to your wallet as part of the same transaction**. It happens in the same block as the trader's registration. Your rate depends on your monthly referred volume — see the tier table below.

You do not need to:
- Log in to trigger a payout
- Reach a minimum balance before receiving payment
- Wait for a monthly distribution
- Submit a claim request

The USDC appears in your wallet balance within 30–90 seconds of the referred trader's transaction confirming.

---

## Verifying a commission

Every commission payment is an on-chain token transfer. To verify:

1. Navigate to the [Affiliate Dashboard →](./01-join-affiliate.md)
2. Find the referral in the Referrals Table
3. Select the **Tx Hash** link to open Etherscan
4. Confirm the USDC transfer to your wallet address in the token transfers section

---

## Commission tiers

Your rate depends on total referred fee volume in the current calendar month (UTC). Volume resets on the 1st of each month. Tiers are stored on-chain and governed by CFG token holders.

| Monthly Volume | Rate | $1K ($30) | $10K ($155) | $25K ($250) | $50K ($345) | $100K ($540) | $200K ($1,080) |
|---|---|---|---|---|---|---|---|
| $0 – $999 | **8%** | $2.40 | $12.40 | $20.00 | $27.60 | $43.20 | $86.40 |
| $1,000 – $2,499 | **10%** | $3.00 | $15.50 | $25.00 | $34.50 | $54.00 | $108.00 |
| $2,500 – $4,999 | **12%** | $3.60 | $18.60 | $30.00 | $41.40 | $64.80 | $129.60 |
| $5,000 – $9,999 | **15%** | $4.50 | $23.25 | $37.50 | $51.75 | $81.00 | $162.00 |
| $10,000+ | **20%** | $6.00 | $31.00 | $50.00 | $69.00 | $108.00 | $216.00 |

---

## Frequently asked questions

**When do I receive my commission?**
Immediately when the referred trader's on-chain registration transaction confirms — typically 30–90 seconds after they pay.

**Is there a cap on how much I can earn?**
No. There is no cap on referrals or total earnings.

**What if my referral uses a different wallet to pay?**
The commission is triggered by the referral code entered at payment time, not the wallet address. As long as your code is used, you receive the commission.

**Can I refer myself?**
No — the smart contract rejects self-referrals (same address as the affiliate and the referred trader).

**What if a referee fails their challenge and retries?**
Each new evaluation fee payment is an independent transaction. If your referral code is used again at retry, you earn another commission.

---

## Related guides

- [How to Track Your Referral Performance →](./02-track-referrals.md)
- [How to Join the Affiliate Program →](./01-join-affiliate.md)
