# How to Deposit as an LP

To deposit into the ChainFunded liquidity pool, navigate to the LP Dashboard, enter the amount of USDC you want to deposit, and confirm the two wallet transactions.

---

## Before you begin

- Wallet connected ([How to connect →](../getting-started/03-connect-wallet.md))
- USDC in your wallet on Ethereum Sepolia
- A small amount of Sepolia ETH for gas fees (~$0.01–$0.10 equivalent)

---

## How it works

When you deposit USDC, you receive **CFND tokens** at a 1:1 rate (1,000 USDC → 1,000 CFND). CFND represents your share of the pool. Returns accumulate separately in a profit pool and can be claimed at any time.

**Revenue sources for LPs:**
- **6%** of every evaluation fee paid by traders
- **20%** of every funded trader payout (the firm cut)

---

## Steps

### Step 1: Navigate to the LP Dashboard

Select **LP Pool** in the navigation bar, or go to `/LPDashboard`.

![The navigation bar with "LP Pool" highlighted as the active link.](/screenshots/lp-02-01_lp-nav.png)

---

### Step 2: Review pool statistics

The top of the LP Dashboard shows live pool stats pulled from the smart contract — Total Capital, Total CFND supply, Total Yield Distributed, and NAV per CFND.

![Four stat cards at the top of the LP Dashboard: Total Capital ($485,230), Total LP Tokens (485,230 CFND), Total Yield Distributed ($12,450), NAV per CFND ($1.00).](/screenshots/lp-02-02_pool-stats.png)

Note: The NAV per CFND is fixed at $1.00. Returns accumulate in the profit pool separately — the token price does not inflate.

---

### Step 3: Select the Deposit tab

Scroll to the **Deposit / Withdraw** panel and select the **Deposit** tab if it is not already active.

![The Deposit/Withdraw panel with the "Deposit" tab selected. Shows a USDC input field and the available wallet balance.](/screenshots/lp-02-03_deposit-tab.png)

---

### Step 4: Enter the deposit amount

Type the amount of USDC to deposit, or select **Max** to deposit your full wallet balance.

![The deposit input showing "1000" entered. Below: "You will receive: 1,000 CFND". Available balance shown above the input.](/screenshots/lp-02-04_deposit-input.png)

---

### Step 5: Approve USDC spending

Select **Deposit**. Your wallet first prompts you to approve the LP contract to spend your USDC. Approve the transaction.

![MetaMask approval: "Allow ChainFunded LP Pool to spend 1,000 USDC?" with "Approve" and "Reject" buttons.](/screenshots/lp-02-05_usdc-approve.png)

Note: This is a spending approval — it does not transfer your USDC yet.

---

### Step 6: Confirm the deposit transaction

After approval, a second transaction request appears for the actual deposit. Confirm it in your wallet.

![MetaMask transaction confirmation for the deposit call to the LP contract. Gas fee shown.](/screenshots/lp-02-06_deposit-confirm.png)

---

### Step 7: Deposit confirmed

Once mined, a success toast appears and your CFND balance updates on the dashboard.

![Toast notification: "Deposit successful — 1,000 CFND minted." The Pool Stats update to reflect the new total. Your position appears in the "Your Positions" table.](/screenshots/lp-02-07_deposit-success.png)

You have now successfully deposited as an LP. Your CFND tokens are active and your share of pool returns begins accruing immediately.

---

## Related guides

- [How to Withdraw LP Capital and Claim Profits →](./03-withdraw-claim.md)
- [LP Yield and Returns Explained →](./04-lp-yield-explained.md)
- [LP Dashboard: UI Reference →](./05-lp-dashboard-reference.md)
