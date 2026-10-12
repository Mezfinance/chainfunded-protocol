# How to Place a Market Order

To place a market order, open the Trading Terminal, set your size and direction, and select **Buy / Long** or **Sell / Short**. The order executes immediately at the current market price.

---

## What is a market order?

A market order executes instantly at the best available price. Use market orders when you want to enter or exit a position immediately and are willing to accept the current price.

All orders on the ChainFunded terminal are market orders by default — there is no order book delay. Your position opens at the price shown in the order panel at the moment you confirm.

---

## Steps

### Step 1: Select an asset

Select the **asset selector** above the chart and choose the asset you want to trade.

![The asset selector showing "BTC/USDT" as the selected asset. The chart is displaying BTC/USDT on the 1H timeframe.](/screenshots/tr-03-01_asset-selected.png)

---

### Step 2: Select direction

In the **Order Panel** on the right, select **Buy / Long** if you expect the price to rise, or **Sell / Short** if you expect it to fall.

![The Order Panel direction tabs. "Buy / Long" tab is selected and highlighted green.](/screenshots/tr-03-02_direction-tabs.png)

---

### Step 3: Enter your size

In the **Size (USD)** field, enter the dollar amount you want to risk (before leverage).

![The Size (USD) input field with "500" entered. The "Position Size" display below shows the notional value after leverage is applied.](/screenshots/tr-03-03_size-input.png)

Note: The **Size** field is your margin — the actual amount deducted from your account. The **Position Size** (Size × Leverage) is your market exposure.

---

### Step 4: Set leverage

Adjust the **Leverage** field to set your multiplier. The calculated Position Size updates automatically.

![The leverage input showing "10x". The Position Size display reads "$5,000" (500 × 10).](/screenshots/tr-03-04_leverage.png)

Note: Higher leverage means a larger position from the same size input. The daily and total loss limits apply to your account equity — a highly leveraged position can breach them quickly.

---

### Step 5: Submit the order

Select **Buy / Long** (green) or **Sell / Short** (red) at the bottom of the Order Panel.

![The green "Buy / Long" button at the bottom of the order panel, active and ready to select.](/screenshots/tr-03-05_submit-button.png)

---

### Step 6: Confirm the trade

A confirmation dialog appears showing your position details. Review them and select **Confirm**.

![A confirmation dialog: "Open BTC/USDT Long — $500 size at 10x. Entry price: $67,432. Confirm / Cancel."](/screenshots/tr-03-06_confirmation.png)

---

### Step 7: Position opens

A success toast notification appears. The new position appears immediately in the **Positions Panel** at the bottom of the terminal.

![A toast notification: "Position opened — BTC/USDT Long $500 @ 10x". The Positions Panel shows the new trade row with real-time P&L.](/screenshots/tr-03-07_position-opened.png)

You have now successfully placed a market order.

---

## Related guides

- [How to Set a Stop Loss and Take Profit →](./05-stop-loss-take-profit.md)
- [How to Place a Limit Order →](./04-limit-orders.md)
- [How to Close a Position →](./06-close-a-position.md)
- [Trading Terminal: UI Reference →](./01-terminal-reference.md)
