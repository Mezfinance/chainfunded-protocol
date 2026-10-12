# Supported Networks and Assets

---

## Networks

ChainFunded currently runs on **Ethereum Sepolia** (testnet). All smart contract interactions — evaluation fee payments, LP deposits, and trader payouts — occur on Sepolia.

| Network | Chain ID | Currency | Explorer |
|---------|----------|----------|---------|
| Ethereum Sepolia | 11155111 | ETH (Sepolia) | sepolia.etherscan.io |

Note: Ethereum Mainnet is not yet supported. All USDC and ETH used on ChainFunded are Sepolia testnet tokens.

---

## Tradeable asset classes

The ChainFunded Trading Terminal supports four asset classes with real market prices sourced from institutional market data providers:

### Crypto
Available 24/7. No market close.

Examples: BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, XRP/USDT, ADA/USDT, AVAX/USDT, DOGE/USDT, LINK/USDT, DOT/USDT

### Forex
**Market hours:** Sunday 17:00 ET – Friday 17:00 ET (closes at weekends)

Examples: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, EUR/GBP, GBP/JPY

### Commodities
**Market hours:** Sunday 18:00 ET – Friday 17:00 ET (daily maintenance break 17:00–18:00 ET)

Examples: XAU/USD (Gold), XAG/USD (Silver), XPT/USD (Platinum), WTI/USD (WTI Crude), BRN/USD (Brent Crude)

### US Stocks (CFDs)
**Market hours:** Monday–Friday, 09:30–16:00 ET

Examples: AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META, JPM

---

## Available leverage

Maximum leverage varies by asset class, and within a class by how liquid the
instrument is:

| Asset Class | Maximum Leverage |
|------------|-----------------|
| Crypto | 10x (large cap), 5x (mid cap) |
| Forex | 100x (majors), 50x (crosses), 30x (exotics) |
| Commodities | 20x (metals), 15x (energy) |
| US Stocks | 5x |

The exact limit for any instrument is shown in the order panel before you
confirm a trade.

Note: Higher leverage increases both potential profit and potential loss. The same drawdown rules apply regardless of leverage — exceeding the daily or total loss limit fails the account instantly.

---

## Price data

All prices are sourced from institutional market data providers and delivered through ChainFunded's own price service. Every trader and the platform's own trade execution read the same tick, so the price you see is the price you are filled at. Prices update in real time during market hours.

---

## Market closure and trading rules

Orders cannot be placed when a market is closed. The Trading Terminal disables the order panel and displays a "Market Closed" status for affected assets. Positions opened before market close remain open and will update when the market reopens.

---

## Related guides

- [How to Trade on the Terminal →](../trading/02-place-a-trade.md)
- [Trading Terminal: UI Reference →](../trading/01-terminal-reference.md)
- [Challenge Rules →](../challenges/02-challenge-rules.md)
