// Presale configuration — single source of truth for the PresaleBar and the
// self-hosted /presale purchase page.
//
// Settlement is on Ethereum mainnet in USDC. thirdweb Pay lets buyers fund
// with any token / any chain; it swaps to USDC before CFGPresale.buy() runs.
// Set `enabled: false` to take the bar/page down.

export const PRESALE = {
  enabled: true,

  // Deployed addresses (filled in env after deploy)
  presaleAddress: import.meta.env.VITE_PRESALE_ADDRESS || "",
  cfgToken:       import.meta.env.VITE_CFG_TOKEN_ADDRESS || "",
  usdc:           import.meta.env.VITE_USDC_ADDRESS || "",
  deployBlock:    import.meta.env.VITE_PRESALE_DEPLOY_BLOCK || "", // for event indexing (feed/leaderboard)

  // Economics (mirror CFGPresale.sol)
  totalAllocation: 2_500_000, // CFG
  tierAllocation:  250_000,   // CFG per tier
  tierCount:       10,
  minBuyUsd:       10,
  maxBuyUsd:       10_000,
  listingPrice:    0.80,      // USD per CFG at DEX listing
};

/** USD price for 1 CFG in tier `i` (0-indexed): $0.04 … $0.76. */
export function tierPrice(i) {
  return 0.04 + i * 0.08;
}

/** Current tier index from CFG sold so far. */
export function tierIndexFromSold(soldCfg) {
  const t = Math.floor(soldCfg / PRESALE.tierAllocation);
  return t >= PRESALE.tierCount ? PRESALE.tierCount - 1 : t;
}

/**
 * Client-side mirror of CFGPresale._quote for live display.
 * @returns {{ cfgOut:number, usdSpent:number, endTier:number }}
 */
export function quote(usdcAmount, soldCfg) {
  let remaining = usdcAmount;
  let sold = soldCfg;
  let cfgOut = 0;
  let usdSpent = 0;
  let i = Math.floor(sold / PRESALE.tierAllocation);
  while (i < PRESALE.tierCount && remaining > 1e-9) {
    const tierEnd = (i + 1) * PRESALE.tierAllocation;
    const cfgLeft = tierEnd - sold;
    const price = tierPrice(i);
    const costToFill = cfgLeft * price;
    if (remaining >= costToFill) {
      cfgOut += cfgLeft; usdSpent += costToFill; remaining -= costToFill; sold = tierEnd; i++;
    } else {
      const cfgBuy = remaining / price;
      cfgOut += cfgBuy; usdSpent += remaining; sold += cfgBuy; remaining = 0;
    }
  }
  return { cfgOut, usdSpent, endTier: Math.min(i, PRESALE.tierCount - 1) };
}

/** Sale is live whenever enabled (open-ended until finalized on-chain). */
export function presaleActive() {
  return PRESALE.enabled;
}
