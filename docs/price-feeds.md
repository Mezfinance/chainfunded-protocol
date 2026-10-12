# Price Feeds — Architecture & Source of Truth

> **TL;DR:** The **worker** is the single source of truth for all live prices and
> trade execution. It holds one upstream connection per provider — **Binance**
> for crypto, **eToro** for FX, commodities and stocks — and streams them to
> every trader over SSE. The browser never connects to an exchange.
>
> **Pyth is gone.** Hermes and Benchmarks both began requiring a paid API key at
> the August 2026 Pyth Core upgrade. Live prices, execution, charts, 24h stats
> and the volatility tracker have all moved.

Last verified: 2026-09 (Pyth → Binance/eToro migration, phases 1–4).

---

## 1. Live prices (frontend)

- **Source: the worker**, via `GET {VITE_WORKER_URL}/prices/stream?symbols=…`.
- `src/hooks/useWorkerPriceFeed.js` opens one `EventSource` and folds frames
  into the ticker shape the terminal consumes.
- `src/lib/PriceContext.jsx` registers symbols and subscribes them all to that
  one stream. There is no per-provider routing in the browser any more.
- Frames: `{ snapshot: {…} }` once on connect so the UI paints immediately,
  then `{ quotes: {…} }` carrying only changed symbols, plus `: ping`
  heartbeat comments.

**There is deliberately no browser-side fallback.** Trades are opened and closed
through the worker too, so a worker outage stops trading regardless — and
showing prices from a source other than the one that settles fills is worse
than showing none. `useBinanceWebSocket` and `usePythPriceFeed` were deleted
with this change; recover them from git history if that call is ever reversed.

## 2. Trade execution (worker)

- `worker/prices.js` runs two feeds behind one interface, both emitting
  `"price"` as `{ symbol, price, conf, publishTimeMs }`:
  - `BinancePriceFeed` — crypto, public `bookTicker` streams, no credentials.
  - `EtoroPriceFeed` — FX, commodities, stocks. Authenticated; needs
    `ETORO_USER_KEY` and `ETORO_API_KEY`.
- `price` is the **mid** of the live bid/ask. `conf` is **half the spread**,
  standing in for Pyth's confidence interval, which no exchange or broker
  publishes. Same ± band around the mid, so the threshold shape carries over.
- Entry/exit prices, SL/TP triggers and drawdown checks all read this feed via
  `worker/executors.js`.

### Fill-freshness limits are per asset class

`getFreshPrice()` refuses a fill on receipt age, publish age, or spread.
Binance pushes crypto sub-second while eToro ticks every ~2–5s, so one shared
limit would either reject nearly every non-crypto fill or let crypto rot.
Defaults live in `.env.example` (`WORKER_MAX_FILL_*` and `*_BROKER`).

> **Open item:** the broker spread ceiling (60 bps) was calibrated against
> after-hours stock quotes, where spreads run 30–80 bps. Re-measure during the
> US session (09:30–16:00 ET) and tighten it.

### eToro gotchas that cost real time

- **Credential naming is inverted.** The long base64 blob is the `userKey`; the
  short opaque string is the `apiKey`. Swapping them returns `Unauthorized`
  with no other clue.
- **Ticks are wrapped**: `{"messages":[{topic,content}]}` with `content` as
  *stringified* JSON — not top-level `topic`/`content` fields.
- **Updates are partial.** Some ticks carry only `Bid`, others only `Ask`.
  Quotes must be *merged* per symbol, never replaced, or the feed emits
  half-quotes and goes silent mid-session.
- **A bare `00` binary keepalive frame** is interleaved with the JSON.
- **Resolve instrument ids by enumerating asset classes**
  (`internalAssetClassId` 1 Forex, 2 Commodity, 5 Stocks). Exact
  `internalSymbolFull` search returns nothing for `GOLD`, `SILVER`, `OIL` and
  `V` even though all four exist and quote live; `searchText` returns a junk
  crypto-statistics row first.

## 3. Chart candles & historical data

- **Source: the worker**, via `GET {VITE_WORKER_URL}/candles`, `/stats24h` and
  `/daily-opens`. `worker/candles.js` routes crypto to Binance klines and
  everything else to eToro, and normalises both to
  `[{ time, open, high, low, close, volume }]`, oldest first.
- Frontend callers go through `src/lib/workerCandles.js`:
  `CandlestickChart`, `use24hStats`, `ZoneHistoricalChart` and the price hook's
  daily opens. `worker/sigmaTracker.js` calls the module directly.
- This replaced `/api/pyth-history` and `/api/daily-opens`. Those Vercel
  proxies are **deleted**, and candles will not go back there: Vercel runs in US
  regions and `binance.com` refuses US IPs, and the eToro credentials belong on
  one server rather than in an edge function.
- Timeframes are Binance-style (`1m 5m 10m 15m 30m 1h 4h 1d 1w`) and map to
  eToro's named intervals in `candles.js`. **`1M` (monthly) is crypto-only** —
  Binance has a 1M kline, eToro rejects the interval, so the chart hides the
  button for FX, commodities and stocks and falls back to `1w` if you switch
  onto one of them while a monthly chart is open.

> **eToro history cannot be paged.** `toDate`, `endDate`, `before` and
> `fromDate` were each verified to be ignored: the API always returns the newest
> N candles, capped at ~1000. So non-crypto history is a hard ceiling of the most
> recent 1000 bars and the chart's scroll-back stops there. `getCandles` returns
> an empty array for a paged non-crypto request rather than the same newest bars,
> because the chart would otherwise read that as more data and request forever.
>
> That ceiling is not tight. Measured depth (daily bars only exist on trading
> days, so 1000 of them span ~4 calendar years):
>
> | | 1m | 1h | 1d |
> |---|---|---|---|
> | Stocks | 18h | 59d | **1488d (4.1y)** |
> | Commodities | 17.7h | 55-59d | ~1410d (3.9y) |
> | FX | 16.7h | 57.6d | 1407d (3.9y) |
> | Crypto | 16.6h | 42d | 999d (2.7y) |
>
> The 1000-bar cap applies per request to Binance too, so stocks and commodities
> carry *more* daily history than crypto does. The only real difference is that
> crypto can page further back via Binance's `endTime`; non-crypto stops here.

Volume: neither provider supplies usable volume (eToro sends `null`). The chart
still overlays exchange REST volume for crypto and Alpha Vantage for the rest.

## 4. Funding rate & open interest

Still from Binance futures REST (`fapi.binance.com` / `fapi.binance.us`) in
`src/components/trader/MarketDataPanel.jsx`. Neither provider has an
equivalent; deliberate, best-effort, non-critical.

## 5. Instrument coverage

65 of the previous 66 instruments survived the migration.

| Class | Count | Provider | Notes |
|-------|-------|----------|-------|
| Crypto | 20 | Binance | symbol-keyed, no id needed |
| Forex | 20 | eToro | all 14 crosses included |
| Commodities | 5 | eToro | GOLD 18, SILVER 19, PLATINUM 40, OIL 17, EuroOIL 341 (Brent) |
| Stocks | 20 | eToro | |

**Dropped: `XPD/USD` (palladium).** eToro publishes ten non-expiry spot
commodities and palladium is not among them. `NATGAS` (22), `Aluminum` (344),
`Nickel` (343), `Zinc` (340) and `Lead` (339) are available if the book widens.

Ids live in `worker/assetConfig.cjs`, mirrored in `src/lib/assetConfig.js`.

## 6. Market hours still apply

eToro instruments carry a real `IsMarketOpen` flag and respect session hours,
so `worker/marketHours.cjs` remains meaningful and weekend drawdown accounting
is unaffected. Both the feed watchdog and `priceMonitor` skip symbols for which
no quote is expected (`isQuoteExpected`, below) — providers going quiet outside
session hours is expected, not a fault, and alerting on it would fire every
night for stocks and every weekend for FX.

`priceMonitor` alerts **per source, not per symbol**. Binance bookTicker only
pushes on an order-book change, so a thin symbol can sit still for a minute on a
healthy connection; per-symbol staleness fired constantly for ATOMUSDT in
production and meant nothing. A dead feed goes silent across all its symbols at
once, which is the signal. Fills are protected separately and more strictly by
`getFreshPrice`.

### Session boundaries are Eastern time, not UTC

Every venue we track rolls at a fixed **US Eastern** wall-clock time: the forex
week, the CME Globex session, the NYSE/NASDAQ bell. Their UTC offset therefore
moves by an hour twice a year with US daylight saving.

`marketHours` originally stored them as fixed UTC hours annotated "(= 5:00 PM
ET)", which is true only from November to March. Through the summer every
boundary ran an hour late: US stocks were treated as open for an hour after the
16:00 ET bell and closed for the first hour of the real session. Boundaries are
now derived from `America/New_York` in both `worker/marketHours.cjs` and
`src/lib/marketHours.js`, so DST is handled for us. A frontend test asserts the
two modules agree on every quarter hour of a full week in both seasons — the
browser decides what to offer and the worker decides what to fill, so a
disagreement means offering a trader a market we will then refuse.

If you add a session boundary, express it in ET minutes-from-midnight. A UTC
constant will be correct in testing and wrong for eight months of the year.

### `isMarketOpen` vs `isQuoteExpected`

Two different questions, and conflating them is a trap:

- **`isMarketOpen`** — is this market trading? Gates the order panel and
  `enforceMarketClose`, which flattens positions on a closed market. Anything
  touching a trader's position uses this.
- **`isQuoteExpected`** — should a provider be publishing ticks right now?
  Stricter: it also excludes intra-session gaps where a venue stops quoting
  without closing. Only the liveness monitors use this.

The gap that forced the split is the **daily forex rollover at 17:00 ET**, when
the interbank day rolls and brokers stop quoting FX for a few minutes. In
production this paged every weekday at 17:01 ET, because the eToro source
carries FX, commodities and stocks together and at that exact moment all three
go quiet at once: stocks have just closed at 16:00 ET, commodities are in their
own 17:00–18:00 ET halt, and FX is in the rollover. With no quote-expecting
symbol left, the monitor read an empty set as a dead feed.

The rollover is deliberately **not** part of `isMarketOpen`. FX has not closed
there and nothing is settled — if it returned false, `enforceMarketClose` would
flatten every open FX position once a day. The suppression window is
`WORKER_FX_ROLLOVER_GAP_MINUTES` (default 15), applied Mon–Thu only: Friday
17:00 ET is the weekly close and Sunday 17:00 ET is the weekly open, so a feed
that fails to come alive on Sunday evening is a real outage worth paging for.
Silence past the window still alerts, which is correct — 26 minutes with no FX
quotes is a fault, and that case appeared in the logs too.

One alert can land as **two Discord posts a minute apart** without any
leadership problem: `priceMonitor` clears a source's re-alert lock the moment a
single tick arrives, so one straggler quote mid-gap re-arms the 60-second timer
and the next alert follows immediately rather than after `REALERT_MS`. The
5-minute re-alert interval only bounds *uninterrupted* silence.

---

## Exchange (Binance / OKX / Bybit) references — what's live vs dead

| File | Status | Notes |
|------|--------|-------|
| `worker/prices.js` | **Live** | `BinancePriceFeed` — crypto execution + display |
| `src/components/trader/CandlestickChart.jsx` | **Live (fallback)** | Crypto candle/volume REST fallback; geo-ordered |
| `src/components/trader/MarketDataPanel.jsx` | **Live** | Funding rate + open interest |
| `src/lib/geoProvider.js` | **Live** | Geo-ordering for the chart's crypto candle/volume fallback only. Now that the worker serves candles this is a fallback-of-a-fallback and could go. |
| `src/hooks/useBinanceWebSocket.js` | **Deleted** | Browser-side crypto fallback; superseded by the worker stream |
| `src/hooks/usePythPriceFeed.js` | **Deleted** | Hermes SSE |

## Why the worker holds the connections

Two reasons, and the first is why we left Binance for Pyth originally:

1. **Geo-blocking is a client-IP problem.** With per-browser connections a
   trader in a blocked country gets nothing, which is what `geoProvider.js` was
   working around. One worker IP serves everyone identically. (Binance is
   unreachable from some regions outright — several hosts return `451`.)
2. **Display and execution can't drift.** The trader sees the same tick the
   worker fills against, rather than two independently-sourced numbers.

It also bounds cost: upstream connections scale with providers, not users.
Quotes are coalesced on a flush interval (`WORKER_PRICE_FLUSH_MS`, default
250ms) because `bookTicker` fires many times a second per symbol and no
terminal needs that resolution.
