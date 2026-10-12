# What is a Funded Trading Challenge?

A funded trading challenge is a two-phase evaluation that proves your trading ability. Pass both phases and you earn a funded account — a live account where you keep 80% of your profits, paid on-chain in USDC.

---

## The two phases

### Phase 1 — Proving consistency
You trade a simulated account and must hit a **10% profit target** without violating the drawdown rules. You have no time limit — take as long as you need, as long as you trade at least 4 days.

### Phase 2 — Confirming the edge
After passing Phase 1, you start Phase 2 with a fresh account at the same size. The profit target drops to **5%**. The same drawdown rules apply. Again, no time limit.

### Funded — Live payouts
After passing Phase 2, you receive a funded account. You trade to build profit, then request an on-chain payout at any time. The smart contract verifies your results and sends **80% of your profits** directly to your wallet.

---

## The rules

The same risk rules apply to both phases:

| Rule | Value |
|------|-------|
| Profit Target (Phase 1) | 10% of account size |
| Profit Target (Phase 2) | 5% of account size |
| Max Daily Loss | 5% of account size |
| Max Total Loss | 10% of account size |
| Min Trading Days | 4 days |
| Time Limit | None |

Violating either loss limit **fails the account instantly** — all positions are closed automatically by the system.

---

## Account sizes and fees

| Account Size | Evaluation Fee |
|-------------|---------------|
| $1,000 | $30 USDC |
| $10,000 | $155 USDC |
| $25,000 | $250 USDC |
| $50,000 | $345 USDC |
| $100,000 | $540 USDC |
| $200,000 | $1,080 USDC |

The fee is a one-time payment. If you fail, you pay the fee again to retry.

---

## What happens on-chain

Everything is enforced by smart contracts:
- Evaluation fee is paid to the ChainFunded liquidity pool
- Phase progression is recorded on-chain
- Payouts are validated and sent by the smart contract — no human approval needed

---

## Related guides

- [Challenge Rules Explained →](./02-challenge-rules.md)
- [How to Start a Challenge →](./03-start-a-challenge.md)
- [How to Pass Phase 1 →](./04-pass-phase-1.md)
- [How to Pass Phase 2 →](./05-pass-phase-2.md)
