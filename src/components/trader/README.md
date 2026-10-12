# trader/ — Trading Terminal & Dashboard Components

These components power the core trading experience: the live terminal, position management, performance tracking, and challenge progress.

## Files

| File | Purpose |
|------|---------|
| `Terminal.jsx` | Main trading terminal layout — assembles chart, order panel, positions, and market data into a unified trading view |
| `OrderPanel.jsx` | Trade entry form — market/limit orders, stop-loss, take-profit, position sizing |
| `ActivePositions.jsx` | Open position table with real-time P&L, close actions, and SL/TP management |
| `CandlestickChart.jsx` | Price chart using TradingView Lightweight Charts — candles, volume, drawing tools |
| `EquityCurve.jsx` | Account performance chart (Recharts) — equity over time, drawdown visualization |
| `PnlCalendar.jsx` | Calendar heatmap showing daily P&L — green/red days at a glance |
| `RuleGauges.jsx` | Visual progress indicators for challenge rules (profit target, drawdown limits, min days) |
| `TradeHistory.jsx` | Closed trade log with entry/exit prices, P&L, and duration |
| `MarketData.jsx` | Real-time price ticker and market overview panel |
| `AccountSelector.jsx` | Dropdown to switch between challenge accounts |
| `MarketSelector.jsx` | Asset picker — crypto pairs, FX, indices |
| `TradingPairList.jsx` | Watchlist-style list of tradeable pairs with live prices |
| `MiniChart.jsx` | Small inline sparkline chart for market overview |
| `PositionSizeCalculator.jsx` | Risk calculator — lot size based on account size, risk %, and stop distance |

## Data Flow

- **Price data** comes from `PriceContext`, which streams every asset class from the worker
- **Account data** (challenge status, balance, P&L) comes from smart contract reads via Thirdweb
- **Trade execution** constructs transactions that the user signs in their wallet
- **Rule enforcement** (drawdown, best-day cap) is monitored by a backend worker and enforced on-chain
