# Challenge Rules Explained

This article explains each rule in detail — what it measures, how it's calculated, and what happens when it's violated.

---

## Profit Target

**Phase 1:** Reach a balance 10% above your starting balance.
**Phase 2:** Reach a balance 5% above your starting balance.

| Account Size | Phase 1 Target | Phase 2 Target |
|-------------|---------------|---------------|
| $1,000 | $1,100 | $1,050 |
| $10,000 | $11,000 | $10,500 |
| $25,000 | $27,500 | $26,250 |
| $50,000 | $55,000 | $52,500 |
| $100,000 | $110,000 | $105,000 |
| $200,000 | $220,000 | $210,000 |

The target is based on **account equity** — the value of your account including any open unrealised P&L. You must reach the target with all positions closed to be able to advance.

---

## Max Daily Loss — 5%

The daily loss limit prevents you from losing more than 5% of your starting account size in a single trading day.

**How it's calculated:** `Starting Account Size × 5%`

**Example ($50,000 account):** Daily loss limit = $2,500. If your equity drops $2,500 below your balance at midnight UTC, your account is failed.

Note: The daily loss limit resets at **midnight UTC** each day. It is calculated from your account balance at midnight — not from the overall starting balance. If you were profitable yesterday, today's floor is higher.

**What triggers it:** Cumulative realised + unrealised losses from midnight UTC to now. If your account equity falls to the floor, all positions are closed and the account is marked failed.

---

## Max Total Loss — 10%

The total loss limit prevents you from losing more than 10% of your original starting balance across the entire phase.

**How it's calculated:** `Original Starting Balance × 10%`

**Example ($50,000 account):** Total loss limit = $5,000. Your equity must stay above $45,000 at all times.

Note: Unlike the daily loss limit, the total loss limit **never resets** within a phase. It is always measured from the starting balance when the phase began.

---

## Minimum Trading Days — 4

You must trade on at least **4 separate calendar days** (UTC) before you can pass a phase, even if you hit the profit target sooner.

A "trading day" is any day with at least one closed trade. Opening and closing a position counts as one trading day, regardless of how many trades you place.

Note: Even losing days count toward the minimum. You do not need 4 profitable days — just 4 days with trading activity.

---

## No Time Limit

There is no expiry date on a challenge. You can take as long as you need to pass, provided you don't violate the drawdown rules.

---

## Rule violations

| Violation | Result |
|-----------|--------|
| Equity hits daily loss floor | Account failed immediately, all positions force-closed |
| Equity hits total loss floor | Account failed immediately, all positions force-closed |
| No violation | Challenge continues |

There is no warning when you approach a limit — the system closes positions automatically when the floor is reached. Monitor your gauges on the [Trader Dashboard →](./07-trader-dashboard.md) at all times.

---

## Related guides

- [How to Pass Phase 1 →](./04-pass-phase-1.md)
- [How to Pass Phase 2 →](./05-pass-phase-2.md)
- [How to Use the Trader Dashboard →](./07-trader-dashboard.md)
- [How to Reset a Failed Challenge →](./06-reset-a-challenge.md)
