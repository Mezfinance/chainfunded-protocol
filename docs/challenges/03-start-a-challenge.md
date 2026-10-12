# How to Start a Challenge

To start a challenge, select your account size on the Start Challenge page and pay the evaluation fee in USDC.

---

## Before you begin

- Wallet connected to ChainFunded ([How to connect your wallet →](../getting-started/03-connect-wallet.md))
- USDC on Ethereum Sepolia — enough to cover the evaluation fee for your chosen account size:

| Account Size | Evaluation Fee |
|-------------|---------------|
| $1,000 | $30 USDC |
| $10,000 | $155 USDC |
| $25,000 | $250 USDC |
| $50,000 | $345 USDC |
| $100,000 | $540 USDC |
| $200,000 | $1,080 USDC |

- A small amount of Sepolia ETH for gas fees (~$0.01–$0.10 equivalent)

---

## Steps

### Step 1: Navigate to Start Challenge

Select **Start Challenge** in the navigation bar. You'll see five account size tiers displayed as cards.

![The Start Challenge page showing all five tier cards ($10K, $25K, $50K, $100K, $200K). The $50K card has a "Most Popular" badge. Each card shows the account size, fee, and a "Select" button. Dark mode.](/screenshots/ch-03-01_tier-cards.png)

---

### Step 2: Select an account size

Select the tier that fits your trading style and budget. The selected card highlights with a green border.

![The $50,000 tier card selected with a bright green border. The other cards appear unselected.](/screenshots/ch-03-02_tier-selected.png)

Note: The rules and profit split are identical across all tiers — only the absolute dollar values of targets and losses differ. Start smaller if this is your first attempt.

---

### Step 3: Review the challenge rules

Below the tier cards, the full challenge rules are displayed. Scroll down to review them before proceeding.

![The rules grid showing six rule items: Phase 1 Profit Target (10%), Phase 2 Profit Target (5%), Max Daily Loss (5%), Max Total Loss (10%), Min Trading Days (4 days), Profit Split (80/20%).](/screenshots/ch-03-03_rules-section.png)

---

### Step 4: Select "Continue to Payment"

Once you've selected a tier, select **Continue to Payment** to proceed.

![The green "Continue to Payment" button active at the bottom of the tier selection area.](/screenshots/ch-03-04_continue-button.png)

---

### Step 5: Enter a referral code (optional)

If someone referred you, enter their referral code in the referral code field. Codes follow the format `CF-XXXXXX`. This has no effect on your fee or challenge.

![The referral code input field with placeholder text "Enter referral code (optional)".](/screenshots/ch-03-05_referral-input.png)

Note: If you arrived via a referral link (e.g. `chainfunded.app/?ref=CF-ABC123`), the code is pre-filled automatically.

---

### Step 6: Approve USDC spending

Select **Pay with Crypto**. Your wallet asks you to approve USDC spending for the ChainFunded smart contract — approve it. The app shows a progress indicator while it waits.

![The payment progress panel showing Step 1 "Approve USDC spending" with an active spinner, waiting for wallet confirmation.](/screenshots/ch-03-06_usdc-approve.png)

Note: This first transaction is an ERC-20 spending approval — it does not transfer your USDC yet. The actual payment happens in the next step.

---

### Step 7: Confirm the fee payment

After approval, your wallet requests a second transaction — the actual fee payment. Confirm it. The app updates to show Step 2 in progress.

![The payment progress panel showing Step 1 complete with a checkmark and Step 2 "Pay fee" with an active spinner.](/screenshots/ch-03-07_payment-confirm.png)

---

### Step 8: Wait for on-chain confirmation

A progress indicator shows while your transaction is being mined. This typically takes **30–90 seconds**.

![The ChainFunded page in a pending state with a spinner and "Confirming transaction…" text.](/screenshots/ch-03-08_tx-pending.png)

---

### Step 9: Challenge activated

Once confirmed, a success screen appears. Your Phase 1 challenge is now live.

![Green success state: "Challenge Started!" showing the account size, phase (Phase 1), and profit target. Two buttons: "Go to Dashboard" and "Start Trading".](/screenshots/ch-03-09_success-screen.png)

You have now successfully started your challenge. Your Phase 1 account is live and the profit target clock starts the first time you place a trade.

---

## Alternative: Pay with card (fiat on-ramp)

If you don't have USDC yet, select **Pay with Card** to purchase USDC and pay the fee in a single flow via the built-in Stripe integration.

![Payment options showing "Pay with Crypto (USDC)" and "Pay with Card" with credit card icons (Visa, Mastercard).](/screenshots/ch-03-10_pay-with-card.png)

---

## Related guides

- [How to Use the Trader Dashboard →](./07-trader-dashboard.md)
- [How to Trade on the Terminal →](../trading/02-place-a-trade.md)
- [How to Pass Phase 1 →](./04-pass-phase-1.md)
