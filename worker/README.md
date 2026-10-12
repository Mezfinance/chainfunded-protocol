# ChainFunded Position Monitor Worker

A persistent Node.js process that monitors all trader positions in real time — even when traders are offline.

## What it does

| Check | Trigger |
|-------|---------|
| Execute pending limit orders | Price crosses `limit_price` |
| Execute pending stop-limit orders | Price crosses `stop_price`, fills at `limit_price` |
| Close positions at Stop Loss | Price crosses `sl` |
| Close positions at Take Profit | Price crosses `tp` |
| Fail account on drawdown breach | 5% daily loss or 10% total drawdown |

Price feeds:
- **Crypto** — Binance WebSocket (provider chain: Binance.com → Binance.US → Tokocrypto → OKX → Bybit)
- **FX / Commodities / Stocks** — eToro WS (needs ETORO_USER_KEY / ETORO_API_KEY)

## Prerequisites

- [Fly.io CLI](https://fly.io/docs/getting-started/installing-flyctl/) installed and authenticated (`fly auth login`)
- Docker installed locally (only needed to build the image)

## Deploy to Fly.io

### 1. Create the Fly app (first time only)

```bash
fly apps create chainfunded-worker
```

### 2. Set secrets

```bash
fly secrets set \
  BASE44_APP_ID=<your-base44-app-id> \
  BASE44_APP_BASE_URL=https://your-app.base44.app \
  --app chainfunded-worker
```

Find your `BASE44_APP_ID` in the base44 dashboard or in the `VITE_BASE44_APP_ID` value in your `.env` file.

### 3. Deploy

Run from the repository root:

```bash
fly deploy --config worker/fly.toml
```

### 4. Verify

```bash
# Watch live logs
fly logs --app chainfunded-worker

# Check the app is running
fly status --app chainfunded-worker
```

You should see output like:

```
[worker] Starting ChainFunded position monitor
[worker] base44 app: abc123 @ https://your-app.base44.app
[worker] Crypto symbols: 20
[worker] feeds: binance 20 crypto | etoro 45 fx+commodities+stocks
[crypto] Connected via Binance host 0 (wss://stream.binance.com:9443)
[pyth] SSE connected (47 feeds)
[worker] heartbeat — 2024-01-01T00:01:00.000Z
```

## Local development

```bash
cd worker
npm install
BASE44_APP_ID=<your-app-id> BASE44_APP_BASE_URL=https://your-app.base44.app node index.js
```

## Re-deploying after code changes

```bash
fly deploy --config worker/fly.toml
```

Fly performs a rolling deploy with zero downtime.

## Scaling / redundancy

To add a second instance in a different region for redundancy:

```bash
fly scale count 2 --app chainfunded-worker
fly regions add ams --app chainfunded-worker
```

The worker is stateless — multiple instances running in parallel is safe. Each instance independently monitors all positions and executes the same checks. base44 entity updates are idempotent (closing an already-closed trade is a no-op), so duplicate execution across instances does not cause issues.
