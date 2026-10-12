# Trading Terminal: UI Reference

This article describes every element on the ChainFunded Trading Terminal. For step-by-step instructions on placing a trade, see [How to Place a Trade →](./02-place-a-trade.md).

---

## Overview

The terminal has four main regions:

| Region | Location | Purpose |
|--------|----------|---------|
| **Account Balance Bar** | Top, full width | Live equity, daily P&L, loss limits |
| **Chart Panel** | Left / centre | Candlestick price chart |
| **Order Panel** | Right | Enter and submit trades |
| **Positions Panel** | Bottom | Active and recently closed trades |

---

## Account Balance Bar

A full-width bar pinned to the top of the terminal page.

- **Equity** — current account balance including all open unrealised P&L
- **Daily P&L** — profit or loss from midnight UTC to now (resets at midnight)
- **Daily Loss Limit** — the floor below which your equity must not fall today. Shown as "used / total" (e.g. $342 / $2,500 used)
- **Total Loss Limit** — the all-time floor for the current phase. Shown as "used / total"
- Values are green when positive/safe, amber when approaching a limit, red when critical
- The bar updates in real time as positions move

---

## Asset Selector

Located above the chart. Displays the currently selected asset symbol (e.g. "BTC/USDT").

- Select it to open the **asset picker dropdown**
- The picker has four tabs: **Crypto**, **Forex**, **Commodities**, **Stocks**
- Each asset shows its current price and 24-hour change percentage
- A search box at the top of the picker filters by name or symbol

---

## Market Status Bar

A narrow status bar below the asset selector.

- **Green dot + "Market Open"** — orders can be placed; shows time until close
- **Red dot + "Market Closed"** — orders are disabled; shows time until open
- Crypto markets are always open (24/7)
- Forex, commodities, and stock markets have scheduled hours. See [Supported Networks and Assets →](../getting-started/05-supported-networks-and-assets.md)

---

## Chart Panel

The main candlestick chart for the selected asset.

- **Timeframe selector** — buttons above the chart: 1m, 5m, 15m, 1H, 4H, 1D
- **Price axis** — right side; shows current price levels
- **Time axis** — bottom; shows timestamps
- **Stop loss line** — a red horizontal dashed line on the chart if a stop loss is set on an open position
- **Take profit line** — a green horizontal dashed line if a take profit is set
- Candles are green (close > open) or red (close < open)

---

## Order Panel

Located on the right side of the terminal.

### Direction tabs
- **Buy / Long** — profit if price rises
- **Sell / Short** — profit if price falls

### Fields

| Field | Description |
|-------|-------------|
| **Size (USD)** | Dollar amount of your position before leverage |
| **Leverage** | Multiplier applied to size. A $500 size at 10x = $5,000 notional position |
| **Position Size** | Calculated notional value (Size × Leverage); display only |
| **Stop Loss** | Price at which the position auto-closes at a loss. Strongly recommended |
| **Take Profit** | Price at which the position auto-closes at a profit |

### Submit button
- **Buy / Long** button (green) — submits a long position
- **Sell / Short** button (red) — submits a short position
- The button is disabled when the market is closed

---

## Positions Panel

Located at the bottom of the terminal. Shows all open positions for the selected account.

### Columns

| Column | Description |
|--------|-------------|
| **Symbol** | Asset being traded (e.g. BTC/USDT) |
| **Direction** | Long (green badge) or Short (red badge) |
| **Size** | Dollar amount entered when the position was opened |
| **Entry Price** | The price at which the position was opened |
| **Current Price** | Live market price |
| **Unrealised P&L** | Current profit or loss if the position were closed now |
| **Stop Loss** | Stop loss price (if set) |
| **Take Profit** | Take profit price (if set) |
| **Close** | Button to manually close the position at the current price |

- P&L values are green (positive) or red (negative) and update in real time
- Selecting **Close** on a row opens a confirmation dialog before the position is closed

---

## Mobile layout

On mobile viewports, the terminal switches to a tab-based layout:

- **Chart tab** — full-screen candlestick chart with asset selector and balance bar
- **Order tab** — order panel for entering trades
- **Positions tab** — active positions list

Tabs are accessible via the tab bar at the bottom of the screen.

---

## Related guides

- [How to Place a Trade →](./02-place-a-trade.md)
- [How to Place a Market Order →](./03-market-orders.md)
- [How to Place a Limit Order →](./04-limit-orders.md)
- [How to Set a Stop Loss and Take Profit →](./05-stop-loss-take-profit.md)
