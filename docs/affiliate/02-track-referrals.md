# How to Track Your Referral Performance

To review your referral earnings and activity, navigate to the Affiliate Dashboard and review the stat cards and referrals table.

---

## Steps

### Step 1: Navigate to the Affiliate Dashboard

Select **Affiliates** in the navigation bar.

---

### Step 2: Read the stat cards

Four stat cards at the top of the dashboard give you an at-a-glance summary.

![Four stat cards: "Total Referrals" (e.g. 12, with a Users icon), "Total Earned" ($148.20 USDC, DollarSign icon), "Commission Rate" (3%, Zap icon), "Active This Month" (4, TrendingUp icon). Each card has a bold value and muted label.](/screenshots/af-02-01_stat-cards.png)

| Card | What it shows |
|------|--------------|
| **Total Referrals** | Total number of traders who have used your referral code to start a challenge |
| **Total Earned** | Cumulative USDC commissions received on-chain |
| **Commission Rate** | Your current tiered rate (8–20%) based on monthly referred volume |
| **Active This Month** | Number of new referral conversions in the current calendar month |

---

### Step 3: Review the referrals table

Scroll down to the **Referrals Table** for a full per-conversion breakdown.

![A table with columns: Date, Trader (truncated wallet address), Account Size ($50,000), Fee Paid ($345.00), Your Commission ($10.35 in green), Tx Hash (truncated with Etherscan link). Rows sorted by date descending.](/screenshots/af-02-02_referrals-table.png)

**Columns:**

| Column | Description |
|--------|-------------|
| **Date** | UTC date and time of the referral conversion (when the fee was paid) |
| **Trader** | Truncated wallet address of the referred trader |
| **Account Size** | The challenge tier they purchased |
| **Fee Paid** | The evaluation fee they paid in USDC |
| **Your Commission** | The 3% commission sent to your wallet |
| **Tx Hash** | On-chain transaction hash — select to verify on Etherscan |

---

### Step 4: Verify earnings on Etherscan

Select any **Tx Hash** link to open Etherscan. The transaction shows the USDC commission transfer from the ChainFunded contract to your wallet address, alongside the trader's registration transaction.

![Etherscan transaction page showing a USDC transfer from the ChainFunded pool contract to the affiliate's wallet. Amount matches the 3% commission.](/screenshots/af-02-03_etherscan-tx.png)

---

## Commission timing

Commissions are paid automatically and instantly — within the same on-chain transaction as the trader's evaluation fee payment. There is no manual disbursement, no monthly payout, and no minimum balance required.

---

## No earnings showing?

| Issue | Likely cause |
|-------|-------------|
| Table is empty | No referral conversions yet, or wrong wallet connected |
| Commission not showing for a known referral | The trader may not have used your referral code; check with them |
| Lower amount than expected | The commission is 3% of the fee, not 3% of the account size |

---

## Related guides

- [How to Join the Affiliate Program →](./01-join-affiliate.md)
- [Platform and Access: Common Questions →](../common-questions/05-platform-and-access.md)
