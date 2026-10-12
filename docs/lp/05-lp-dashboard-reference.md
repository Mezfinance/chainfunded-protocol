# LP Dashboard: UI Reference

This article describes every element on the ChainFunded LP Dashboard. For step-by-step instructions, see [How to Deposit as an LP →](./02-deposit.md) or [How to Withdraw and Claim Profits →](./03-withdraw-claim.md).

---

## Accessing the LP Dashboard

Select **LP Pool** in the top navigation bar, or navigate to `/LPDashboard`.

---

## Pool Statistics Section

Located at the top of the page. Displays live data pulled from the smart contract. Refreshes every 15 seconds.

| Stat Card | Description |
|-----------|-------------|
| **Total Capital** | Total USDC currently in the LP pool |
| **Total LP Tokens (CFND)** | Total CFND tokens in circulation |
| **Total Yield Distributed** | Cumulative yield paid out to LPs since deployment |
| **Current NAV per CFND** | Net Asset Value per token — always $1.00 (principal stays stable; yield is separate) |

---

## Deposit / Withdraw Panel

A tabbed panel in the centre of the page.

### Deposit tab

| Element | Description |
|---------|-------------|
| **USDC input field** | Enter the amount of USDC you want to deposit |
| **Available Balance** | Your current wallet USDC balance, shown above the input |
| **Max button** | Fills the input with your full available USDC balance |
| **"You will receive" display** | Shows how many CFND tokens you will receive (always 1:1 with USDC) |
| **Deposit button** | Initiates the deposit flow (USDC approval + deposit transaction) |

### Withdraw tab

| Element | Description |
|---------|-------------|
| **CFND input field** | Enter the amount of CFND you want to redeem |
| **CFND Balance** | Your current on-chain CFND balance |
| **Max button** | Fills with your full CFND balance |
| **"You will receive" display** | Shows USDC you will receive (always 1:1 with CFND) |
| **Withdraw button** | Initiates the withdrawal transaction |

---

## Your Position Section

Shows your individual LP position. Updates in real time.

| Element | Description |
|---------|-------------|
| **CFND Balance** | Your current on-chain CFND token balance |
| **USDC Value** | Dollar value of your CFND at current NAV ($1.00 per CFND) |
| **Unclaimed Yield** | Accumulated profit in USDC available to claim |
| **Claim Profits button** | Initiates an on-chain claim of your accumulated yield |
| **Status badge** | "Active" (green) if you hold CFND; "No Position" if balance is zero |

---

## Your Positions Table

Lists your LP transactions and current position details. Includes:

| Column | Description |
|--------|-------------|
| **LP Address** | Your wallet address (truncated) |
| **CFND Balance** | On-chain CFND token balance |
| **USDC Value** | Current USD value |
| **Unclaimed Yield** | Claimable yield in USDC |
| **Status** | Active / No Position |
| **Claim** button | Direct claim action per row |

---

## Pool Activity Feed

A log of recent pool events, visible below the positions table:

- Deposit events (address, amount, timestamp)
- Withdrawal events
- Yield distribution events (triggered by evaluation fee payments and payout firm cuts)
- Each event links to the corresponding Etherscan transaction

---

## Related guides

- [What is Liquidity Providing? →](./01-what-is-lp.md)
- [How to Deposit as an LP →](./02-deposit.md)
- [How to Withdraw LP Capital and Claim Profits →](./03-withdraw-claim.md)
- [LP Yield and Returns Explained →](./04-lp-yield-explained.md)
