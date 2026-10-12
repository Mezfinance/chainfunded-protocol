# Threat Monitoring Setup Guide

## Tier 1: Tenderly Alerts (Free)

### Setup

1. Go to https://dashboard.tenderly.co and sign up (free)
2. Create a project (e.g. "ChainFunded")
3. Add the ChainFundedPool contract:
   - Go to Contracts → Add Contract
   - Network: Sepolia
   - Address: your ChainFundedPool address
   - Tenderly will auto-detect the ABI if verified on Etherscan

4. Also add: CFGGovernor, CFGToken, TimelockController

### Alerts to Configure

Go to Alerts → New Alert for each:

#### CRITICAL Alerts (Slack + Email + PagerDuty)

| Alert | Type | Condition |
|-------|------|-----------|
| Signer Changed | Event | `SignerUpdated` event emitted |
| Guardian Changed | Event | `GuardianUpdated` event emitted |
| Protocol Paused | Event | `Paused` event emitted |
| Protocol Unpaused | Event | `Unpaused` event emitted |
| Emergency Capital Withdrawal | Function Call | `emergencyWithdrawCapital()` called |
| Emergency Profit Withdrawal | Function Call | `emergencyWithdrawProfits()` called |
| Ownership Transferred | Event | `OwnershipTransferred` event emitted |
| Large Payout | Event | `PayoutClaimed` with grossProfitUsdc > threshold |

#### WARNING Alerts (Slack only)

| Alert | Type | Condition |
|-------|------|-----------|
| Rules Changed | Event | `RulesUpdated` event emitted |
| Protocol Wallet Changed | Event | `ProtocolWalletUpdated` event emitted |
| Failed Transaction | Transaction Status | Any failed tx on ChainFundedPool |
| Governance Proposal Created | Event | `ProposalCreated` on CFGGovernor |
| Governance Proposal Executed | Event | `ProposalExecuted` on CFGGovernor |

### Notification Channels

1. Go to Settings → Notifications
2. Add Slack: connect your workspace, select a #security-alerts channel
3. Add Email: team@chainfunded.io
4. (Later) Add PagerDuty for on-call rotation

---

## Tier 1: Worker Price Monitoring (Free)

Already deployed on Fly.io. Add cross-reference checks to the existing
price feed system.

### What to Monitor

| Check | Condition | Action |
|-------|-----------|--------|
| Feed staleness | No update in >30 seconds while the market is open | Log warning, alert Slack |
| Wide bid/ask spread | Half-spread over the per-asset-class ceiling | Reject the fill, keep last known good |
| Feed disconnect | A provider's WS down and not recovering | Alert critical, halt order execution |

### Implementation

The price monitoring is added to the existing worker's price feed system.
See `worker/prices.js` for the integration points.

---

## Tier 2: Forta Custom Bot (~$35/month)

### Setup

1. Install Forta CLI: `npm install -g forta-agent`
2. Initialize: `npx forta-agent@latest init --typescript`
3. Build a bot that monitors ChainFundedPool events
4. Deploy to Forta network (requires 100 FORT stake)
5. Subscribe to alerts via Forta Explorer

### What the Bot Tracks

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Single payout / LP capital | >5% | WARNING |
| Single payout / LP capital | >15% | CRITICAL |
| 24h cumulative payouts / LP capital | >25% | WARNING |
| 24h cumulative payouts / LP capital | >40% | CRITICAL |
| Payouts per hour | >10 | WARNING |
| LP capital vs peak | <50% | WARNING |
| LP capital vs peak | <20% | CRITICAL |

---

## Tier 2: OpenZeppelin Monitor + Auto-Pause (~$10/month)

### Setup

1. Deploy OZ Monitor Docker container on Fly.io
2. Configure monitoring rules (YAML)
3. Deploy OZ Relayer with guardian private key
4. Configure auto-pause: when CRITICAL alert fires, Relayer sends pause() tx

### Auto-Pause Flow

```
OZ Monitor detects anomaly
    → fires webhook to Relayer
    → Relayer sends pause() via guardian key
    → ChainFundedPool paused within seconds
    → Alert sent to Slack + PagerDuty
```

---

## Tier 3: At Scale ($1M+ TVL)

### Hypernative
- Contact sales: https://www.hypernative.io
- 300+ risk types, mempool detection, automated pause
- Used by Uniswap, Chainlink, Circle

### Chainalysis KYT
- Transaction-level compliance screening
- Chainlink on-chain integration coming Q2 2026

---

## Alert Escalation Matrix

| Level | Response Time | Who | Action |
|-------|--------------|-----|--------|
| INFO | Next business day | Engineering | Review in daily standup |
| WARNING | 4 hours | On-call engineer | Investigate, assess risk |
| CRITICAL | 15 minutes | On-call + team lead | Auto-pause fires. Verify if real threat or false positive. |
| EMERGENCY | Immediate | Full team | Guardian already paused. Assess damage. Begin remediation. |
