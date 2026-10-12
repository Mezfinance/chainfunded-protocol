export const affiliateGuides = [
  {
    slug: "get-referral-link",
    title: "How to get your affiliate referral link",
    category: "affiliate",
    intro:
      "The ChainFunded affiliate program lets you earn 8–20% of the first challenge fee for every trader you refer. Your rate scales with monthly volume — the more you refer, the higher your commission that month.",
    steps: [
      {
        heading: "Navigate to the Affiliate Dashboard",
        text: "Click 'Affiliate' in the navigation bar to open the Affiliate Dashboard.",
        screenshot: "referral-link-step-1.png",
      },
      {
        heading: "Join the program",
        text: "If this is your first visit, click 'Join Affiliate Program'. Your referral code is generated instantly from your wallet address — no approval required.",
        screenshot: "referral-link-step-2.png",
      },
      {
        heading: "Find your referral code",
        text: "Your unique referral code (e.g. CF-1A2B3C) is shown at the top of the dashboard. It's permanently tied to your wallet address.",
        screenshot: "referral-link-step-3.png",
      },
      {
        heading: "Copy your referral link",
        text: "Click 'Copy' next to your referral URL to copy it to your clipboard. The link embeds your wallet address so commissions are attributed on-chain.",
        screenshot: "referral-link-step-4.png",
      },
      {
        heading: "Share your link",
        text: "Share your referral link in communities, social media, or directly with traders. When someone uses your link to pay their first challenge fee, your commission is sent to your wallet in the same on-chain transaction.",
        screenshot: "referral-link-step-5.png",
      },
    ],
    tips: [
      {
        type: "info",
        text: "Commission is earned on the first evaluation fee paid by each referred trader only. If the same trader buys a second challenge later, no additional commission is earned.",
      },
      {
        type: "info",
        text: "Your rate starts at 8% and increases up to 20% as your total referred fee volume grows within the calendar month. Volume resets on the 1st of each month (UTC).",
      },
    ],
    relatedGuides: ["track-affiliate-commissions"],
  },
  {
    slug: "track-affiliate-commissions",
    title: "How to track affiliate commissions",
    category: "affiliate",
    intro:
      "Every commission is recorded on-chain and visible in your Affiliate Dashboard. You can track your current commission rate, monthly volume progress, full earnings history, and individual transaction hashes.",
    steps: [
      {
        heading: "Open the Affiliate Dashboard",
        text: "Navigate to the Affiliate page. The summary cards at the top show total commissions earned, total unique referrals, and your current commission rate.",
        screenshot: "track-commissions-step-1.png",
      },
      {
        heading: "Check the tier progress widget",
        text: "The tier progress bar shows this month's total referred fee volume and how close you are to the next commission tier. The right side shows your current rate (e.g. 8%, 10%, 12%, 15%, or 20%).",
        screenshot: "track-commissions-step-2.png",
      },
      {
        heading: "View the commission scale",
        text: "Click 'Commission Scale' to expand the full tier table. Your current tier is highlighted. Tiers range from 8% (under $1,000/month volume) to 20% ($10,000+/month).",
        screenshot: "track-commissions-step-3.png",
      },
      {
        heading: "Commission history table",
        text: "The table below the tier widget shows every commission event: transaction hash, USDC earned, and the referred trader's wallet address.",
        screenshot: "track-commissions-step-4.png",
      },
      {
        heading: "Verify on the block explorer",
        text: "Click any transaction hash to view the on-chain proof of payment on the block explorer. This is your immutable receipt.",
        screenshot: "track-commissions-step-5.png",
      },
    ],
    tips: [
      {
        type: "info",
        text: "Monthly volume resets on the 1st of each calendar month (UTC). If you're close to a tier threshold, try to push referrals before month-end to maximise your rate on all fees that month.",
      },
      {
        type: "info",
        text: "The 'Current Rate' stat card always reflects your live tier for the current month based on on-chain activity.",
      },
    ],
    relatedGuides: ["get-referral-link"],
  },
];
