# contracts/ — ChainFunded Smart Contracts

Solidity smart contracts deployed on Ethereum (currently Sepolia testnet, mainnet Q2 2026).

## Contracts

| Contract | LOC | Purpose |
|----------|-----|---------|
| **ChainFundedPool.sol** | 722 | Core protocol contract. Handles challenge creation, fee allocation (14.4% Foundation, 4.8% SG, 4.8% DE, 6% LP, ~62% capital pool), LP deposits/withdrawals (USDC ↔ CFND), ECDSA-verified payout execution, affiliate commission distribution, and drawdown enforcement. |
| **CFGToken.sol** | 93 | CFG governance token. ERC-20 with 100,000,000 fixed supply (no inflation). Includes ERC20Votes for on-chain governance delegation. |
| **CFGGovernor.sol** | 147 | DAO governance. OpenZeppelin Governor with Timelock — CFG holders vote on protocol parameters (profit splits, drawdown rules, fee structures, treasury allocation). |
| **CFGVesting.sol** | 108 | Token vesting. Enforces vesting schedules for team, founder, and advisor CFG allocations. |
| **CFGDistributor.sol** | ~320 | Season-based CFG distribution to challenge accounts (paid + whitelisted). 15M CFG across 10 seasons. |
| **CFGLPRewards.sol** | ~330 | Synthetix-style staking: LPs stake CFND to earn CFG + proxy-harvested USDC. 10M CFG across 10 seasons. |

## Fee Allocation (per challenge)

```
Trader pays fee in USDC
    ├── 14.4%  → Foundation protocol wallet
    ├──  4.8%  → Singapore Pte. Ltd. (software licensing)
    ├──  4.8%  → Delaware LLC (software licensing)
    ├──  6.0%  → LP profit pool (yield for LPs)
    ├── 8–20%  → Affiliate (if referred)
    └── ~50–62% → Capital pool reserves (funds payouts)
```

## Payout Flow

1. Backend generates ECDSA-signed proof of trader performance
2. Trader calls `claimPayout(proof)` on ChainFundedPool.sol
3. Contract verifies the ECDSA signature against the trusted signer address
4. Contract transfers USDC (80% profit + fee refund) to trader's wallet
5. All in a single atomic transaction

## Development

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia
```

## Dependencies

- Solidity 0.8.25
- OpenZeppelin Contracts 5.x (ERC20, Governor, TimelockController, ERC20Votes, ECDSA)
- Hardhat 2.22
