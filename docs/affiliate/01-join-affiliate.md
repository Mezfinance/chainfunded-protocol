# How to Join the Affiliate Program

To join the ChainFunded affiliate program, connect your wallet and navigate to the Affiliate Dashboard. Your referral code is generated automatically — no application required.

---

## How it works

1. Your unique referral code is tied to your wallet address (format: `CF-XXXXXX`)
2. Share your referral link: `https://chainfunded.app/?ref=CF-XXXXXX`
3. When a referred trader pays an evaluation fee, your **tiered commission (8–20%)** is sent to your wallet automatically as part of the on-chain registration transaction
4. Your commission rate depends on your monthly referred volume — the more you refer, the higher your rate
5. Earnings are visible in the Affiliate Dashboard and verifiable on Etherscan

**Commission tiers (based on monthly referred fee volume):**

| Monthly Volume | Commission Rate |
|---|---|
| $0 – $999 | 8% |
| $1,000 – $2,499 | 10% |
| $2,500 – $4,999 | 12% |
| $5,000 – $9,999 | 15% |
| $10,000+ | 20% |

Volume resets on the 1st of each calendar month (UTC). Tiers and rates are stored on-chain and governed by CFG token holders.

**Example:** A trader you referred buys a $50,000 challenge ($345 fee) and you're at the base tier → you earn **$27.60 USDC** (8%), instantly on-chain. At the top tier (20%) that same referral earns **$69.00 USDC**.

---

## Steps

### Step 1: Navigate to the Affiliate Dashboard

Select **Affiliates** in the navigation bar, or go to `/AffiliateDashboard`.

![The navigation bar with "Affiliates" highlighted as the active link.](/screenshots/af-01-01_affiliate-nav.png)

---

### Step 2: View your referral code and link

Your referral code is generated automatically from your wallet address. No sign-up is required.

![The Affiliate Dashboard showing: stat cards (Total Referrals, Total Earned, Commission Rate 3%, Active This Month), and a "Your Referral Link" card with the full URL and a "Copy Link" button.](/screenshots/af-01-02_affiliate-overview.png)

---

### Step 3: Copy your referral link

Select **Copy Link**. The full referral URL is copied to your clipboard.

![The "Copy Link" button. After selecting, it briefly shows a green checkmark + "Copied!" confirmation.](/screenshots/af-01-03_copy-link.png)

Your referral link looks like:
```
https://chainfunded.app/?ref=CF-1A2B3C
```

---

### Step 4: Share your link

Share your referral link on any channel — social media, Discord, Telegram, YouTube, newsletters, or direct messages. There are no restrictions on promotion methods.

Note: Traders who visit via your referral link have the code pre-filled automatically on the Start Challenge page. They do not need to type the code manually, which reduces drop-off.

---

### Step 5: Track your earnings

The stat cards on the Affiliate Dashboard update as your referrals convert. See [How to Track Your Referral Performance →](./02-track-referrals.md) for a detailed walkthrough.

You have now successfully set up your affiliate account. Earnings are paid automatically on-chain each time a referred trader starts a challenge.

---

## Your referral code format

Your code is deterministically generated from your wallet address:

```
CF-[first 6 characters of your address, uppercase]
```

For example, wallet `0x1a2b3c4d…` → code `CF-1A2B3C`

Your code never changes as long as you use the same wallet.

---

## Related guides

- [How to Track Your Referral Performance →](./02-track-referrals.md)
- [Platform and Access: Common Questions →](../common-questions/05-platform-and-access.md)
