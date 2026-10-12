# How to Withdraw LP Capital and Claim Profits

To withdraw deposited USDC, select the **Withdraw** tab on the LP Dashboard, enter the amount of CFND to redeem, and confirm the transaction. To claim accumulated yield without withdrawing principal, select **Claim Profits** in the Your Position section.

---

## Before you begin

- Wallet connected ([How to connect →](../getting-started/03-connect-wallet.md))
- CFND tokens in your wallet (received when you deposited)
- A small amount of Sepolia ETH for gas fees

---

## Withdrawing principal

### Step 1: Navigate to the LP Dashboard

Select **LP Pool** in the navigation bar.

---

### Step 2: Select the Withdraw tab

In the **Deposit / Withdraw** panel, select the **Withdraw** tab.

![The Deposit/Withdraw panel with the "Withdraw" tab selected. Shows a CFND input field and your current CFND balance.](/screenshots/lp-03-01_withdraw-tab.png)

---

### Step 3: Enter the withdrawal amount

Enter the amount of CFND to redeem, or select **Max** to withdraw your full balance. The "You will receive" field shows the USDC equivalent (1:1).

![The CFND input with "1000" entered. "You will receive: 1,000 USDC" is shown below. CFND balance displayed above.](/screenshots/lp-03-02_withdraw-input.png)

---

### Step 4: Confirm the withdrawal transaction

Select **Withdraw**. Confirm the single transaction in your wallet.

![MetaMask confirmation for the withdrawal transaction. Gas fee shown.](/screenshots/lp-03-03_withdraw-confirm.png)

---

### Step 5: Withdrawal complete

Once confirmed, a success toast appears. Your USDC arrives in your wallet and your CFND balance decreases accordingly.

![Toast: "Withdrawal successful — 1,000 USDC returned to your wallet." The Your Position section updates.](/screenshots/lp-03-04_withdraw-success.png)

You have now successfully withdrawn your LP capital.

---

## Claiming accumulated yield (without withdrawing)

### Step 1: Check your unclaimed yield

In the **Your Position** section, the **Unclaimed Yield** value shows how much USDC you can claim right now.

![The Your Position card showing: CFND Balance (5,000), USDC Value ($5,000), Unclaimed Yield ($234.50 in green), and a "Claim Profits" button.](/screenshots/lp-03-05_unclaimed-yield.png)

---

### Step 2: Select "Claim Profits"

Select the **Claim Profits** button. Confirm the transaction in your wallet.

![MetaMask transaction confirmation for the claim. The amount of USDC being claimed is shown.](/screenshots/lp-03-06_claim-confirm.png)

---

### Step 3: Yield claimed

Once confirmed, the claimed USDC is sent directly to your wallet. The Unclaimed Yield counter resets to $0.00.

![Toast: "Profit claimed — $234.50 USDC sent to your wallet." The Unclaimed Yield card now shows $0.00.](/screenshots/lp-03-07_claim-success.png)

You have now successfully claimed your LP profits. Your CFND principal remains in the pool and continues to earn returns.

---

## Related guides

- [How to Deposit as an LP →](./02-deposit.md)
- [LP Yield and Returns Explained →](./04-lp-yield-explained.md)
- [LP Dashboard: UI Reference →](./05-lp-dashboard-reference.md)
