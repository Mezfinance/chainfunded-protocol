# ChainFunded

**An on-chain prop trading firm.** Traders pay a USDC fee into a smart contract, pass a two-phase evaluation on live market prices, and claim 80% of their profits straight to their wallet from the same contract. Liquidity providers fund the payout pool and earn a share of fees and profit.

Live on Ethereum mainnet at [chainfunded.io](https://chainfunded.io). Submitted to the Colosseum Crypto World's Fair.

---

## How the money moves

```
 Trader ──USDC fee──▶ ChainFundedPool ──splits on-chain──▶ payout capital (~70%) · LP yield (6%) · firm (24%)
                              │
 Worker (execution + risk) ──▶ signed ledger of every trade
                              │
 Claim oracle re-verifies the ledger + rules ──▶ signed proof
                              │
 Trader submits proof ──▶ ChainFundedPool verifies signatures ──▶ USDC to trader's wallet
```

1. **Fee in.** `registerChallenge` takes the evaluation fee ($30–$1,080) and splits it at fixed rates: 24% to the firm, 6% to LP yield, the rest stays in the pool as payout capital (affiliate commission, capped at 20%, comes out of that share).
2. **Evaluation.** The worker streams live prices (Binance for crypto, eToro for FX, commodities and stocks), executes orders and enforces the rules: 10% then 5% profit targets, 5% daily and 10% total loss limits, minimum trading days, best-day consistency. Every ledger row is EIP-191 signed by the worker.
3. **Payout.** The claim oracle (`worker/claim.js`) reloads the ledger, rejects tampered rows, recomputes the metrics from scratch, checks the rules and screens the wallet for OFAC sanctions. Only then does it sign the exact hash the contract checks. The contract requires a threshold of authorised signers before it pays.
4. **LPs.** `deposit` / `withdraw` / `claimProfit` on the pool. Solvency, reserves and every challenge are public views.

## Safeguards

- `Ownable2Step` ownership and a pause guardian on the pool
- **48-hour timelock** on any admin withdrawal (`requestEmergencyWithdrawal` → `executeEmergencyWithdrawal`)
- Proofs bind the chain ID and expire after 24 hours; settled payout IDs can't be replayed
- OFAC screening (Chainalysis) before any proof is signed

**Known next steps:** move payout signers onto independent infrastructure, require a signature on every ledger row (admin-closed trades are currently unsigned), and an external audit before scaling the LP pool.

## Mainnet contracts

| Contract | Address |
|---|---|
| ChainFundedPool (UUPS proxy) | [`0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc`](https://etherscan.io/address/0xfbdc2592f7d8ae59d1abebb88cf33b2ac70383fc) |
| CFGToken | [`0xde56217645c54f00258826f944f772117aca041b`](https://etherscan.io/address/0xde56217645c54f00258826f944f772117aca041b) |
| CFGGovernor | [`0x4e8637ada57187524e30efbedd55b706f9c8be50`](https://etherscan.io/address/0x4e8637ada57187524e30efbedd55b706f9c8be50) |
| Timelock | [`0xdc7f1d4e9bffa8739f4b0b173700f599f7eb3ac4`](https://etherscan.io/address/0xdc7f1d4e9bffa8739f4b0b173700f599f7eb3ac4) |
| CFGDistributor | [`0x0576ff8c9291bf58c9c6a6a9623b98f05b913904`](https://etherscan.io/address/0x0576ff8c9291bf58c9c6a6a9623b98f05b913904) |
| CFGLPRewards | [`0x0b5072a88454fa1553787bfd9cbfbe346f7d0edd`](https://etherscan.io/address/0x0b5072a88454fa1553787bfd9cbfbe346f7d0edd) |

## Where to look

| Path | What's there |
|---|---|
| [`contracts/contracts/ChainFundedPool.sol`](contracts/contracts/ChainFundedPool.sol) | Core pool: fee split, challenges, signed-proof payouts, LP accounting, timelock |
| [`contracts/contracts/`](contracts/contracts/) | CFG token, governor, vesting, season distributor, LP rewards, revenue router |
| [`worker/claim.js`](worker/claim.js) | Claim oracle: ledger verification, rule checks, OFAC, proof signing |
| [`worker/ledgerSig.js`](worker/ledgerSig.js) | Canonical signed-ledger format |
| [`worker/executors.js`](worker/executors.js), [`worker/priceStream.js`](worker/priceStream.js) | Order execution, stop-loss/take-profit, drawdown checks, live price streaming |
| [`src/components/trader/`](src/components/trader/) | Trading terminal (TradingView Lightweight Charts) |
| [`api/contract-agent.js`](api/contract-agent.js) | AI agent that answers questions grounded in the verified pool source |
| [`docs/price-feeds.md`](docs/price-feeds.md) | How prices reach the worker and the browser |

## Run it

```bash
# Frontend
npm ci
cp .env.example .env.local   # fill in VITE_THIRDWEB_CLIENT_ID etc.
npm run dev

# Contracts
cd contracts && npm ci
npx hardhat compile
npx hardhat test

# Unit tests (frontend + hooks)
npm run test:unit

# Worker tests
npm run test:worker
```

## Stack

Solidity 0.8.25 · OpenZeppelin 5 · Hardhat · React · Vite · Tailwind · shadcn/Radix · Thirdweb · ethers.js · Node.js on Fly.io · Supabase · Vercel · Claude Haiku (support and contract agents).

Most of the code was written with [Claude Code](https://claude.ai/code) under the team's direction and review.

---

Source is published for review. All rights reserved.
