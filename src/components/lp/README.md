# lp/ — Liquidity Provider Components

Components for the LP Dashboard where liquidity providers manage their USDC deposits.

## Files

| File | Purpose |
|------|---------|
| `DepositWithdraw.jsx` | Deposit USDC into the pool (receive CFND tokens) or withdraw (burn CFND for USDC). Constructs smart contract transactions for the user to sign. |
| `PoolStats.jsx` | Pool health dashboard — TVL, utilisation rate, yield APY, historical distributions, active funded accounts |

## How the LP Pool Works

1. LP deposits USDC → smart contract mints CFND tokens 1:1
2. Pool earns from two sources: 6% of every challenge fee + 20% of the protocol's 20% profit cut
3. LP can withdraw anytime (subject to pool liquidity) — burns CFND, receives USDC
4. Pool funds trader payouts and fee refunds
