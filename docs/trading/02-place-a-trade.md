# How to Place a Trade

To start trading, open the Trading Terminal, select an asset, set your direction and size, and select **Buy / Long** or **Sell / Short**.

---

## Before you begin

- Wallet connected ([How to connect →](../getting-started/03-connect-wallet.md))
- Active Phase 1 or Phase 2 challenge account ([How to start →](../challenges/03-start-a-challenge.md))
- Review your daily and total loss limits on the [Trader Dashboard →](../challenges/07-trader-dashboard.md) before trading — violating either fails your account instantly

---

## Steps

### Step 1: Select an account

On entering the terminal, select which challenge account you're trading from the **account dropdown** at the top of the page.

![The account selector dropdown at the top of the terminal showing available accounts by size and phase. The selected account ($50,000 Phase 1) is highlighted.](/screenshots/tr-02-01_account-dropdown.png)

---

### Step 2: Check the Account Balance Bar

The balance bar at the top shows your current financial position. Review it before every trade.

![Full-width bar showing: Equity $51,234.56 | Daily P&L +$342.10 | Daily Loss Limit $2,500.00 (used $0.00) | Total Loss Limit $5,000 (used -$765.44). Values green when positive, red when negative.](/screenshots/tr-02-02_balance-bar.png)

Note: When your equity drops to the daily loss floor or total loss floor, all positions are force-closed and your account is failed. There is no manual override.

---

### Step 3: Select an asset

Select the **asset selector** (shows the current symbol, e.g. "BTC/USDT") to open the asset picker. Browse by asset class or search by name.

![The asset picker with four tabs: Crypto, Forex, Commodities, Stocks. The Crypto tab is active showing a list of assets with prices and 24h change. A search box filters the list.](/screenshots/tr-02-03_asset-dropdown.png)

**Asset classes and market hours:**

| Asset Class | Examples | Market Hours |
|------------|---------|-------------|
| Crypto | BTC, ETH, SOL | 24/7 |
| Forex | EUR/USD, GBP/JPY | Sun 17:00 – Fri 17:00 ET |
| Commodities | Gold, Oil, Silver | Sun 18:00 – Fri 17:00 ET |
| US Stocks | AAPL, NVDA, TSLA | Mon–Fri 09:30 – 16:00 ET |

Hours are given in US Eastern time (ET), which is how the underlying venues
set their sessions. The equivalent UTC time shifts by an hour when US
daylight saving starts and ends.

Note: If a market is closed, the Order Panel is disabled. You cannot open new positions outside market hours.

---

### Step 4: Set up your trade in the Order Panel

In the **Order Panel** on the right, fill in:

| Field | Description |
|-------|-------------|
| **Direction** | Buy (Long) — profit if price rises. Sell (Short) — profit if price falls. |
| **Size** | Dollar amount of your position (before leverage) |
| **Leverage** | Multiplier applied to your size |
| **Stop Loss** | Price at which your trade auto-closes at a loss (strongly recommended) |
| **Take Profit** | Price at which your trade auto-closes at a profit |

![The right-side order panel showing direction tabs (Buy/Sell), Size (USD) input, Leverage input, Stop Loss and Take Profit fields, and the Buy / Long submit button.](/screenshots/tr-02-04_order-panel.png)

Note: Always set a Stop Loss. The daily loss limit applies to total open + closed P&L — a large leveraged trade without a stop can breach it in seconds.

---

### Step 5: Place the trade

Select **Buy / Long** or **Sell / Short**. Your trade opens immediately at the current market price.

![A toast notification: "Position opened — BTC/USDT Long $500 @ 10x". The Positions Panel at the bottom now shows the new trade row.](/screenshots/tr-02-05_trade-submitted.png)

---

### Step 6: Monitor active positions

Open trades appear in the **Positions Panel** at the bottom of the terminal. Each row shows unrealised P&L, stop loss, take profit, and a **Close** button.

![The Positions Panel table with one open trade. Columns: Symbol, Direction (Long/Short badge), Size, Entry Price, Current Price, Unrealised P&L (green/red), Stop Loss, Take Profit, Close button. P&L updates in real time.](/screenshots/tr-02-06_active-positions.png)

---

### Step 7: Close the position

To close a trade manually before it hits stop or take profit, select **Close** on that row and confirm in the popup.

![Confirmation dialog: "Close BTC/USDT Long? Current P&L: +$124.50. Confirm / Cancel."](/screenshots/tr-02-07_close-position.png)

You have now successfully placed and closed a trade.

---

## Mobile trading

On mobile, the terminal uses a tab-based layout. Select **Chart**, **Order**, or **Positions** tabs at the bottom to switch views.

---

## Related guides

- [How to Place a Market Order →](./03-market-orders.md)
- [How to Place a Limit Order →](./04-limit-orders.md)
- [How to Set a Stop Loss and Take Profit →](./05-stop-loss-take-profit.md)
- [Trading Terminal: UI Reference →](./01-terminal-reference.md)
