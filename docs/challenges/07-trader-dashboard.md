# How to Use the Trader Dashboard

To open the Trader Dashboard, select **Dashboard** in the top navigation bar.

---

## Before you begin

- Wallet connected ([How to connect →](../getting-started/03-connect-wallet.md))
- At least one active challenge account ([How to start a challenge →](./03-start-a-challenge.md))

---

## Steps

### Step 1: Select an account

Use the **account selector dropdown** at the top of the page to choose which challenge account to view. If you have multiple accounts, each appears here with its size, phase badge, and status.

![The account dropdown open, showing a list of accounts with size, phase badge (Phase 1 / Phase 2 / Funded / Failed), and account ID. Accounts are colour-coded: green = active, amber = warning, red = failed, blue = funded.](/screenshots/ch-07-01_account-selector.png)

---

### Step 2: Read the stat cards

Four stat cards appear below the account selector and update in real time.

| Card | What it shows |
|------|--------------|
| **Current Balance** | Your simulated account equity right now |
| **Daily P&L** | Profit or loss since midnight UTC today |
| **Total P&L** | Total profit or loss since the phase started |
| **Profit Target** | Dollar amount remaining to hit your target |

![The four stat cards: Current Balance ($51,234.56), Daily P&L (+$342.10 green), Total P&L (+$1,234.56 green), Profit Target ($3,765.44 remaining).](/screenshots/ch-07-02_stat-cards.png)

---

### Step 3: Monitor the rule gauges

The three **rule gauges** show how close you are to each limit and target. Check these before every trading session.

![Three circular arc gauges: "Daily Loss" at 34% used (green), "Total Loss" at 24% used (green), "Profit Target Progress" at 25% complete (teal).](/screenshots/ch-07-03_rule-gauges.png)

**Gauge colours:**
- **Green** — safe zone
- **Amber** — caution, above 70% of the limit used
- **Red** — critical, above 90% used
- **Fully filled (red)** — account failed

Note: The daily loss gauge resets at **midnight UTC** each day. The total loss gauge never resets within a phase.

---

### Step 4: Read the P&L calendar

The P&L calendar shows your performance by day — green cells are profitable days, red cells are losing days.

![A month-view calendar grid. Each day cell has a small dollar P&L value and a green or red background. Neutral/no-trade days are blank.](/screenshots/ch-07-04_pnl-calendar.png)

Note: You need at least **4 calendar days with closed trades** to satisfy the minimum trading days rule — losing days count.

---

### Step 5: Review the equity curve

Scroll down to see the **equity curve** — a line chart of your account balance over time. The profit target level and max drawdown floor are marked as dashed lines.

![A line chart showing account equity over time. The profit target ($55,000 for Phase 1 on a $50K account) is shown as a teal dashed line. The total loss floor ($45,000) is shown as a red dashed line.](/screenshots/ch-07-05_equity-curve.png)

---

### Step 6: Browse trade history

The **trade history table** lists every closed trade in the current account.

![Trade history table: columns for Date, Symbol, Direction (Buy/Sell badge), Size, Entry Price, Exit Price, and P&L. Positive P&L in green, negative in red.](/screenshots/ch-07-06_trade-history.png)

---

### Step 7: Check the phase progression banner

The **phase status banner** at the top of the dashboard shows your current phase, profit target progress bar, and days traded count.

![Phase 1 banner showing profit target progress bar at 24%, days traded count (2 of 4 required), and a "Go to Terminal" button.](/screenshots/ch-07-07_phase-banner.png)

---

## Viewing failed accounts

By default, failed accounts are hidden. Select **"Show Archived"** near the account selector to view them. Failed accounts are read-only — trade history and the equity curve are preserved.

---

## Related guides

- [How to Trade on the Terminal →](../trading/02-place-a-trade.md)
- [How to Pass Phase 1 →](./04-pass-phase-1.md)
- [How to Request a Payout →](../payouts/02-request-payout.md)
