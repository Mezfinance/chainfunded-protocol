# How to Place a Limit Order

To place a limit order, open the Trading Terminal, select the **Limit** tab in the Order Panel, enter your target price and size, and select **Place Limit Order**. The position opens automatically when the market reaches your price.

---

## What is a limit order?

A limit order lets you specify the exact price at which you want to enter a trade. Your order is held until the market reaches your price, at which point it executes automatically.

Use limit orders when:
- You want to enter at a specific price rather than the current price
- You are waiting for a pullback or breakout level
- You want to avoid slippage on entry

---

## Steps

### Step 1: Select an asset

Select the **asset selector** above the chart and choose the asset you want to trade.

---

### Step 2: Select the Limit tab

In the **Order Panel**, select the **Limit** tab at the top. The order form updates to show a **Limit Price** field.

![The Order Panel with the "Limit" tab selected (underlined/highlighted). The form now shows a "Limit Price" field below the direction tabs.](/screenshots/tr-04-01_limit-tab.png)

---

### Step 3: Select direction

Select **Buy / Long** or **Sell / Short** depending on which direction you want to trade.

---

### Step 4: Enter your limit price

In the **Limit Price** field, enter the price at which you want the order to execute.

![The Limit Price field with a price entered (e.g. "66,500" for a BTC buy limit below the current price of $67,432).](/screenshots/tr-04-02_limit-price.png)

Note: For a **Buy / Long** limit order, your limit price should be **below** the current price. For a **Sell / Short** limit order, your limit price should be **above** the current price. The order panel will warn you if the price is in the wrong direction.

---

### Step 5: Enter your size and leverage

Enter the **Size (USD)** and **Leverage** as you would for a market order. See [How to Place a Market Order →](./03-market-orders.md).

---

### Step 6: Set stop loss and take profit (recommended)

Enter a **Stop Loss** and **Take Profit** price. These are applied immediately when the limit order executes. See [How to Set a Stop Loss and Take Profit →](./05-stop-loss-take-profit.md).

---

### Step 7: Select "Place Limit Order"

Select **Place Limit Order** at the bottom of the Order Panel.

![The "Place Limit Order" button at the bottom of the order panel. It is blue or neutral in colour (not green/red like market order buttons).](/screenshots/tr-04-03_place-order.png)

---

### Step 8: Order is queued

A confirmation shows the limit order is queued. The order appears in the **Pending Orders** section of the Positions Panel.

![The Positions Panel showing a "Pending Orders" sub-section with one entry: "BTC/USDT Long — Limit @ $66,500 — $500 size @ 10x". A "Cancel" button is on the right.](/screenshots/tr-04-04_pending-order.png)

---

### Step 9: Order executes

When the market reaches your limit price, the order executes automatically. The pending order row is replaced by an open position row with live P&L.

You have now successfully placed a limit order. It will execute when the market reaches your specified price.

---

## Cancelling a pending limit order

To cancel a limit order before it executes, select **Cancel** on the pending order row in the Positions Panel.

---

## Related guides

- [How to Place a Market Order →](./03-market-orders.md)
- [How to Set a Stop Loss and Take Profit →](./05-stop-loss-take-profit.md)
- [How to Close a Position →](./06-close-a-position.md)
