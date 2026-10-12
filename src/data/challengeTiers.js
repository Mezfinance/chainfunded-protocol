// Challenge account tier configuration — simulated account sizes and
// evaluation fees. Used by Onboarding (tier selection) and the global
// LaunchSaleBanner (persistent discount indicator).
//
// `fee` is the actual USDC amount charged. `originalFee` is crossed out for
// display when `launchSale` is true. The on-chain contract must have the
// same `fee` set via setChallengeTiers() or payments will revert.

export const CHALLENGE_TIERS = [
  { size: 1000,   fee: 20,   originalFee: 30, launchSale: true, label: "$1,000",   popular: false, tvlUnlock: 0 },
  { size: 2500,   fee: 50,   originalFee: 60, launchSale: true, label: "$2,500",   popular: false, tvlUnlock: 0 },
  { size: 10000,  fee: 155,  label: "$10,000",  popular: false, tvlUnlock: 100000 },
  { size: 25000,  fee: 250,  label: "$25,000",  popular: false, tvlUnlock: 250000 },
  { size: 50000,  fee: 397,  label: "$50,000",  popular: true,  tvlUnlock: 500000 },
  { size: 100000, fee: 622,  label: "$100,000", popular: false, tvlUnlock: 1000000 },
  { size: 200000, fee: 1244, label: "$200,000", popular: false, tvlUnlock: 2000000 },
];

// Tiers currently on Launch Sale — empty array means no sale is active.
export const LAUNCH_SALE_TIERS = CHALLENGE_TIERS.filter(t => t.launchSale && t.originalFee);
