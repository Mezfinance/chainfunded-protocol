# Fee economics

The challenge fee paid at `registerChallenge(feeAmount, ...)` is
partitioned in the same transaction. Three constants and one
mapping govern the partition:

| Identifier | Value | Destination |
|---|---|---|
| `FEE_PROTOCOL_BPS` | `2400` (24%) | `labsWallet` (protocol revenue) |
| `FEE_PROFIT_POOL_BPS` | `600` (6%) | LP profit pool (yield to CFND holders) |
| `MAX_AFFILIATE_BPS` | `2000` (20%) | hard ceiling on affiliate share |
| `affiliateRateBps(monthlyVolume)` | `0`–`2000` (per ladder) | affiliate wallet, when `affiliate != address(0)` |
| (residual) | `5000`–`7000` | LP capital reserve (backs payouts) |

Constants are immutable in the implementation; modifying them
requires a UUPS upgrade and triggers the storage-layout baseline
check in CI. The affiliate rate is the single variable
component, set per-call by the contract's `_affiliateRateBps`
function against the affiliate's rolling-30-day volume; see §13
for the ladder configuration.

## Funded-trader payout splits

`claimPayout` partitions the asserted profit between the trader
and the firm using the per-challenge `traderShareBps` recorded
at `registerChallenge` (default `8000` — 80% to trader). The
remaining 20% (the firm cut) is then split:

| Identifier | Value | Destination |
|---|---|---|
| `FIRM_CUT_PROTOCOL_BPS` | `8000` (80% of firm cut) | `labsWallet` |
| (residual) | `2000` (20% of firm cut) | LP profit pool |

Composing: of every USDC of trader profit, the trader receives
80%; `labsWallet` receives 80% × 20% = 16%; the LP profit pool
receives 20% × 20% = 4%.

## Worked example — a $50 challenge fee

For a trader buying the $2,500-tier challenge at the $50 launch-sale
price, with no referring affiliate:

```
feeAmount                = $50.00
protocol (24%)           = $12.00  → labsWallet
LP yield pool (6%)       =  $3.00  → accProfitPerToken updated
affiliate (0%)           =  $0.00  → no transfer (affiliate=address(0))
LP capital reserve (70%) = $35.00  → stays in pool
```

For the same trader referred by a Tier-3 affiliate (12%):

```
feeAmount                = $50.00
protocol (24%)           = $12.00  → labsWallet
LP yield pool (6%)       =  $3.00  → accProfitPerToken
affiliate (12%)          =  $6.00  → affiliate wallet
LP capital reserve (58%) = $29.00  → stays in pool
```

The affiliate share is the only variable component; the protocol and
LP-yield slices are fixed by `FEE_PROTOCOL_BPS` and
`FEE_PROFIT_POOL_BPS`. Worst case for LP capital is a maximum-tier
affiliate at the `MAX_AFFILIATE_BPS = 2000` cap, leaving 50% of
the fee as LP-capital reserves.

## Diagram

![Figure 6 · Where every USDC of a challenge fee goes](fee-split.svg)

## Properties

- **Allocation is atomic.** Fee partitioning happens inside
  `registerChallenge` in a single transaction; there is no
  separate "settle" step that could leave the splits in an
  inconsistent state. The same property holds for firm-cut
  splits inside `claimPayout`.
- **Splits are public and grep-able.** Each split is a public
  constant or a publicly-readable mapping (`challengeTierFee`,
  `affiliateTierThresholds`, `affiliateTierRates`).
- **Tier prices are owner-configurable; splits are not.** The
  owner can update `challengeTierFee[size]` per tier via
  `setChallengeTiers`, but the percentage allocation
  (`FEE_PROTOCOL_BPS` etc.) is hard-coded into the
  implementation.

The 24%-protocol / 6%-LP-yield ratio is front-loaded by design:
protocol operating costs (signer infrastructure, audits,
ongoing development) are funded at challenge purchase, not at
payout settlement. This decouples revenue from trader-pass
rates, which is the relevant property for sizing protocol-level
runway.
