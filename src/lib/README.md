# lib/ — Context Providers & Utilities

Core infrastructure: React context providers, query client setup, and shared utilities.

## Key Files

| File | Purpose |
|------|---------|
| `AuthContext.jsx` | Authentication provider — wallet connection state, current address, admin check against `VITE_ADMIN_ADDRESSES`, login/logout |
| `PriceContext.jsx` | Real-time price feed provider — subscribes every symbol to the worker's SSE stream (`useWorkerPriceFeed`). The browser holds no exchange connections. Provides `usePrices()` hook. |
| `query-client.js` | React Query client instance — shared across the app for caching, refetching, and optimistic updates |
| `PageNotFound.jsx` | 404 page component |

## Provider Hierarchy (in App.jsx)

```
ThemeProvider (next-themes)
  → ThirdwebProvider (wallet SDK)
    → QueryClientProvider (React Query)
      → AuthProvider (wallet auth state)
        → PriceProvider (live price feeds)
          → Router + Layout + Pages
```
