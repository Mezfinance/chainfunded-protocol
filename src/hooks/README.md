# hooks/ — Custom React Hooks

Reusable hooks that encapsulate data fetching, state management, and business logic.

## Key Hooks

These hooks provide the core data layer for the application. Most use React Query for caching and refetching, with Thirdweb SDK for on-chain reads.

Check individual hook files for parameters and return values. The naming convention is `use<Resource>` for data hooks and `use<Action>` for mutation hooks.

## Data Sources

- **On-chain data** (balances, challenge status, pool stats): Read via Thirdweb SDK contract reads
- **Price data**: Injected via `PriceContext`, which reads the worker's price stream
- **User auth state**: Injected via `AuthContext` (wallet connection status, address, admin check)
