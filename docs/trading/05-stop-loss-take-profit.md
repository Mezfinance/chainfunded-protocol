# How to Set a Stop Loss and Take Profit

To set a stop loss or take profit, enter the price levels in the **Stop Loss** and **Take Profit** fields in the Order Panel before submitting a trade — or update them on an open position from the Positions Panel.

---

## What are stop loss and take profit?

- **Stop Loss** — an automatic exit that closes your position if the market moves against you to a specified price, limiting your loss
- **Take Profit** — an automatic exit that closes your position when the market reaches a profitable price you specify

Both are optional but strongly recommended. The daily and total loss limits on your challenge account are absolute — a single uncontrolled loss can fail your account.

---

## Setting stop loss and take profit when opening a trade

### Step 1: Open the Order Panel

Open the [Trading Terminal →](./02-place-a-trade.md) and set your direction, size, and leverage as normal.

---

### Step 2: Enter a stop loss price

In the **Stop Loss** field, enter the price at which you want the position to close automatically at a loss.

![The Stop Loss field in the Order Panel with a price entered below the current market price (for a long position). A small red line appears on the chart at the stop loss level.](/screenshots/tr-05-01_stop-loss-input.png)

**Calculating a stop loss:**
- Decide the maximum dollar loss you are willing to accept on this trade
- Calculate: `Stop Loss Distance = Max Loss / (Size × Leverage / Entry Price)`
- Set the stop loss at `Entry Price − Stop Loss Distance` (for longs) or `Entry Price + Stop Loss Distance` (for shorts)

Note: For a **long position**, the stop loss must be **below** the entry price. For a **short position**, it must be **above** the entry price.

---

### Step 3: Enter a take profit price

In the **Take Profit** field, enter the price at which you want the position to close automatically at a profit.

![The Take Profit field with a price entered above the current market price (for a long position). A green dashed line appears on the chart at the take profit level.](/screenshots/tr-05-02_take-profit-input.png)

---

### Step 4: Submit the trade

Select **Buy / Long** or **Sell / Short**. The position opens with both exit levels active. The stop loss and take profit levels appear as horizontal dashed lines on the chart.

---

## Updating stop loss and take profit on an open position

### Step 1: Find the position in the Positions Panel

The Positions Panel at the bottom of the terminal shows all open trades with their current stop loss and take profit levels.

---

### Step 2: Select "Edit" on the position row

Select **Edit** (pencil icon) on the position row you want to update.

![The Positions Panel row with the Edit button (pencil icon) highlighted on the right side.](/screenshots/tr-05-03_edit-position.png)

---

### Step 3: Enter the new levels

An inline edit form or modal appears. Enter the updated stop loss and/or take profit prices and select **Save**.

![A modal showing the current stop loss and take profit values as editable fields. Updated values are highlighted. A "Save" button and "Cancel" button are at the bottom.](/screenshots/tr-05-04_edit-modal.png)

You have now successfully set or updated your stop loss and take profit levels.

---

## Why stop losses are critical on ChainFunded

The daily loss limit (5% of account size) resets at midnight UTC. If you leave a large leveraged position open without a stop loss and the market moves sharply, your equity can breach the daily floor in seconds — failing your account instantly. A stop loss is your last line of defence.

---

## Related guides

- [How to Place a Market Order →](./03-market-orders.md)
- [How to Close a Position →](./06-close-a-position.md)
- [Challenge Rules Explained →](../challenges/02-challenge-rules.md)
