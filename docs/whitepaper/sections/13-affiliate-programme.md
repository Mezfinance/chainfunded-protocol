# Affiliate programme

`registerChallenge` accepts an `affiliate` parameter. When
`affiliate != address(0)` and `affiliate != msg.sender` (else
`SelfReferral`), the pool computes the affiliate's commission
share via `_affiliateRateBps(affiliateMonthlyVolume[affiliate]
[currentEpoch])` and transfers that share of the fee to the
affiliate's wallet in the same transaction. Settlement is
atomic; there is no separate claim function.

## State

```
mapping(address => mapping(uint256 => uint256)) affiliateMonthlyVolume;
mapping(address => mapping(address => bool))    affiliateHasReferred;
uint256[] affiliateTierThresholds;   // ascending
uint256[] affiliateTierRates;        // each ≤ MAX_AFFILIATE_BPS, non-decreasing
uint256 constant MAX_AFFILIATE_BPS = 2000;
```

`currentEpoch = block.timestamp / 30 days`. The
`affiliateMonthlyVolume[a][e]` mapping accumulates referred fee
volume for affiliate `a` in epoch `e`. The window is sliding
over time without explicit cleanup; the mapping is only read
for the current epoch when computing a tier rate.

`affiliateHasReferred[affiliate][trader]` is set on first
referral and consulted to gate the affiliate-rate path: a
trader's first registration referred by an affiliate counts
toward the affiliate's volume; subsequent registrations by the
same trader do not, regardless of whether they pass `affiliate`
again.

## Tier evaluation

`_affiliateRateBps(monthlyVolume)` performs a linear search
over `affiliateTierThresholds[]` and returns the corresponding
rate from `affiliateTierRates[]`. Worst-case cost is `O(T)` per
call where `T = affiliateTierThresholds.length`; in practice
`T ≤ 5` and the cost is dominated by storage reads (warm slots
after the first iteration).

## Configuration

```
function setAffiliateTiers(uint256[] calldata thresholds,
                            uint256[] calldata rates) external onlyOwner
```

Pre-conditions:
- `thresholds.length == rates.length` (else `LengthMismatch`)
- `thresholds[]` strictly ascending (else `ThresholdsNotAscending`)
- `rates[]` non-decreasing (else `RatesNotNonDecreasing`)
- each `rate ≤ MAX_AFFILIATE_BPS` (else `RateExceedsCap`)

The owner can re-tier the ladder per call, but cannot raise an
individual rate above the protocol-level cap without redeploying
the implementation. Re-tierings do not retroactively re-rate
already-registered challenges; they affect only future
`registerChallenge` calls.

## Diagram

![Figure 9 · Affiliate commission ladder · example schedule](affiliate-ladder.svg)
