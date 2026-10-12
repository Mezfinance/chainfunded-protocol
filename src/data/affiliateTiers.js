/**
 * Affiliate commission tiers — single source of truth.
 *
 * Rate is applied to the FIRST evaluation fee paid by each referred trader.
 * Subsequent challenge purchases by the same trader do not earn commission.
 * Volume resets on the 1st of each calendar month (UTC).
 */
export const AFFILIATE_TIERS = [
  { minVolume: 0,      maxVolume: 999,    rate: 0.08, label: "8%"  },
  { minVolume: 1000,   maxVolume: 2499,   rate: 0.10, label: "10%" },
  { minVolume: 2500,   maxVolume: 4999,   rate: 0.12, label: "12%" },
  { minVolume: 5000,   maxVolume: 9999,   rate: 0.15, label: "15%" },
  { minVolume: 10000,  maxVolume: Infinity, rate: 0.20, label: "20%" },
];

/** Return the tier object for a given monthly volume (USDC). */
export function getTierForVolume(volumeUsdc) {
  return (
    AFFILIATE_TIERS.find(
      (t) => volumeUsdc >= t.minVolume && volumeUsdc <= t.maxVolume
    ) ?? AFFILIATE_TIERS[0]
  );
}

/** Return the next tier above the current one, or null if already at max. */
export function getNextTier(currentTier) {
  const idx = AFFILIATE_TIERS.indexOf(currentTier);
  return idx >= 0 && idx < AFFILIATE_TIERS.length - 1
    ? AFFILIATE_TIERS[idx + 1]
    : null;
}

/** Dollars still needed to reach the next tier, or 0 if already at max. */
export function volumeToNextTier(volumeUsdc) {
  const next = getNextTier(getTierForVolume(volumeUsdc));
  return next ? Math.max(0, next.minVolume - volumeUsdc) : 0;
}
