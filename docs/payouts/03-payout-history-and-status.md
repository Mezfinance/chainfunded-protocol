# Payout History and Status

All your past payouts are recorded on the **My Account** page. Each payout links to its on-chain transaction on the block explorer.

---

## Accessing payout history

Select your account menu in the top-right corner and choose **My Account**, or navigate to `/MyAccount` directly. Your payout history is displayed at the bottom of the page.

![The My Account page with the payout history table visible at the bottom.](/screenshots/py-03-01_my-account-payouts.png)

---

## The payouts table

The payout history table shows all payout requests associated with your wallet address.

![The payout history table showing columns: Date, Status, Your Share (80%), and Transaction link.](/screenshots/py-03-02_payouts-table.png)

**Columns:**

| Column | Description |
|--------|-------------|
| **Date** | Date the payout was requested |
| **Status** | Current state of the payout request (see status table below) |
| **Your Share (80%)** | USDC amount sent to your wallet |
| **Transaction** | On-chain transaction hash — select to view on the block explorer |

---

## Payout statuses

| Status | Colour | Meaning |
|--------|--------|---------|
| **Pending** | Yellow | Request submitted and awaiting on-chain processing |
| **Settled** | Green | USDC successfully sent to your wallet. Verifiable on-chain |
| **Rejected** | Red | Request rejected. See troubleshooting table below |

---

## Verifying a payout on-chain

Select the **transaction hash** link on any settled payout row to open the block explorer. The transaction shows:
- **From:** the ChainFunded smart contract address
- **To:** your wallet address
- **Value:** the USDC amount (your 80% share)
- **Status:** Success

This provides independent, tamper-proof verification of every payment.

---

## Payout troubleshooting

| Problem | Likely cause | Solution |
|---------|-------------|---------|
| Status shows "Rejected" | Smart contract rule check failed or compliance issue | Verify you passed Phase 2; contact support with your account ID |
| Payout amount differs from expected | Open positions affected equity at time of request | Close all positions before requesting; re-request payout |
| No payouts visible | Wrong wallet connected | Ensure the wallet address matches the address used to register the challenge |
| Claim button greyed out | Not all compliance checks are green | Continue trading until all rules are met |

---

## Related guides

- [How to Request a Payout →](./02-request-payout.md)
- [How Profit Splits Work →](./01-how-profit-splits-work.md)
