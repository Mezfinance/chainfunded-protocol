# How to Request a Payout

To request a payout, navigate to the Trader Hub, select the Rewards tab, and select **Claim Payout**. The smart contract validates your results and sends 80% of your profits to your wallet automatically.

---

## Before you begin

- Passed both Phase 1 and Phase 2 of the challenge
- Wallet connected (same address used to register the challenge)
- Your funded account must have equity above the starting balance (positive profit)

Note: Close all open positions before requesting a payout. Open positions affect equity and the payout amount shown may not match what you expect if positions close during processing.

---

## Steps

### Step 1: Navigate to the Trader Hub

Select **Dashboard** in the navigation bar. Make sure your funded account is selected in the account dropdown (phase badge reads "Funded").

![The Trader Dashboard with a funded account selected. The phase badge reads "Funded" in blue or gold. Stat cards show profit above starting balance (e.g. Current Balance $53,200, Total P&L +$3,200 in green).](/screenshots/py-02-01_funded-account.png)

---

### Step 2: Select "Rewards"

Select the **Rewards** tab in the top-right navigation of the Trader Hub. This opens the Rewards page showing your compliance status and payout history.

![The Trader Hub with the "Rewards" tab highlighted in the top-right navigation.](/screenshots/py-02-02_rewards-tab.png)

---

### Step 3: Review compliance and select "Claim Payout"

The Rewards page shows a **Rule Compliance Check** with all the requirements for your payout. Each rule displays a green checkmark when passed or a red cross when not yet met.

All checks must be **green** before the **Claim Payout** button becomes active. If any check is red, continue trading until all requirements are met.

Once all checks are green, select **Claim Payout (80% to wallet)** at the bottom of the compliance section.

![The Rewards page showing the Rule Compliance Check with all rules passing (green checkmarks). The "Claim Payout (80% to wallet)" button is active at the bottom.](/screenshots/py-02-03_claim-button.png)

---

### Step 4: Review your payout summary

A payout summary appears showing your profit breakdown. Review the amounts carefully.

Note: The USDC will be sent to the **same wallet address** that registered the challenge. Verify the address shown is correct before proceeding.

---

### Step 5: Sign the payout request

Your wallet asks you to sign the transaction. This submits the payout to the smart contract for on-chain verification.

![MetaMask transaction popup showing the payout details. "Confirm" and "Reject" buttons visible.](/screenshots/py-02-05_wallet-sign.png)

Note: A legitimate payout request shows your address and a USDC amount. It will never ask you to approve token spending or transfer funds separately. If the request looks different, decline and contact support.

---

### Step 6: Wait for on-chain processing

After signing, the payout is submitted to the smart contract for verification. Processing takes **30–90 seconds**.

![The Rewards page in a pending state with a spinner: "Generating compliance proof…" followed by "Submitting to contract — waiting for confirmation…".](/screenshots/py-02-06_payout-processing.png)

The smart contract checks:
1. Phase 2 was passed (profit target and risk rules met)
2. The payout hasn't already been processed (replay protection)
3. The signature is valid

---

### Step 7: Payout complete

Once confirmed, a success screen shows your payout amount and a link to the block explorer transaction.

![Green success state: "Payout settled on-chain!" with transaction hash and explorer link.](/screenshots/py-02-07_payout-success.png)

You have now successfully requested and received your payout. The USDC arrives in your wallet within seconds of the transaction confirming.

---

## Payout troubleshooting

| Problem | Likely cause | Solution |
|---------|-------------|---------|
| Claim button greyed out | Not all compliance checks are green | Continue trading until all rules are met |
| "No Funded Accounts" message | Account has not reached funded phase | Complete Phase 1 and Phase 2 first |
| Transaction fails on-chain | Smart contract rule check failed | Contact support with your account ID |
| Wrong amount shown | Open positions affecting equity | Close all positions before requesting |

---

## Related guides

- [Payout History and Status →](./03-payout-history-and-status.md)
- [How Profit Splits Work →](./01-how-profit-splits-work.md)
- [How to Start Another Challenge →](../challenges/03-start-a-challenge.md)
