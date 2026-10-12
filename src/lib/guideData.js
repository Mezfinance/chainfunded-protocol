export const GUIDE_CATEGORIES = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: "🚀",
    guides: [
      { slug: "getting-started/01-what-is-chainfunded", title: "What is ChainFunded?", description: "How on-chain prop trading works and what makes ChainFunded different from traditional firms." },
      { slug: "getting-started/02-getting-started", title: "Getting Started with ChainFunded", description: "Everything you need before your first challenge — wallet, USDC, and network setup." },
      { slug: "getting-started/03-connect-wallet", title: "How to Connect Your Wallet", description: "Step-by-step guide for MetaMask and WalletConnect-compatible wallets." },
      { slug: "getting-started/04-supported-wallets", title: "Supported Wallets", description: "Which EVM wallets are compatible and how to connect via browser injection or WalletConnect." },
      { slug: "getting-started/05-supported-networks-and-assets", title: "Supported Networks and Assets", description: "Which blockchain network ChainFunded runs on and which assets you can trade." },
      { slug: "getting-started/06-my-account", title: "How to Use the My Account Page", description: "View total rewards paid, pending payouts, and update your profile details." },
      { slug: "getting-started/08-support-centre", title: "Support Centre: UI Reference", description: "Navigate the FAQ, How-To Guides, Terms of Service, and Privacy Policy tabs." },
    ],
  },
  {
    id: "challenges",
    label: "Challenges",
    icon: "🏆",
    guides: [
      { slug: "challenges/01-what-is-a-challenge", title: "What is a Funded Trading Challenge?", description: "How the two-phase evaluation works and what you earn when you pass." },
      { slug: "challenges/02-challenge-rules", title: "Challenge Rules Explained", description: "Daily loss limit, max drawdown, minimum trading days — every rule in detail." },
      { slug: "challenges/03-start-a-challenge", title: "How to Start a Challenge", description: "Select an account size, pay the evaluation fee in USDC, and go live." },
      { slug: "challenges/04-pass-phase-1", title: "How to Pass Phase 1", description: "Hit the 10% profit target while respecting loss limits across at least 4 trading days." },
      { slug: "challenges/05-pass-phase-2", title: "How to Pass Phase 2", description: "Hit the 5% profit target under the same rules to unlock your funded account." },
      { slug: "challenges/06-reset-a-challenge", title: "How to Reset a Failed Challenge", description: "What happens when a rule is breached and how to start a new attempt." },
      { slug: "challenges/07-trader-dashboard", title: "How to Use the Trader Dashboard", description: "Track your challenge progress, phase status, and account stats in one place." },
    ],
  },
  {
    id: "trading",
    label: "Trading",
    icon: "📈",
    guides: [
      { slug: "trading/01-terminal-reference", title: "Trading Terminal: UI Reference", description: "Every panel, button, and indicator on the terminal — chart, order panel, positions, history." },
      { slug: "trading/02-place-a-trade", title: "How to Place a Trade", description: "Open a position in the trading terminal — asset selection, direction, and size." },
      { slug: "trading/03-market-orders", title: "How to Place a Market Order", description: "Execute a trade immediately at the current market price." },
      { slug: "trading/04-limit-orders", title: "How to Place a Limit Order", description: "Set a target entry price and let the order fill automatically when the market arrives." },
      { slug: "trading/05-stop-loss-take-profit", title: "How to Set a Stop Loss and Take Profit", description: "Attach SL/TP levels before opening a trade or update them on an existing position." },
      { slug: "trading/06-close-a-position", title: "How to Close a Position", description: "Fully close an open position from the Positions Panel and confirm the transaction." },
    ],
  },
  {
    id: "payouts",
    label: "Payouts",
    icon: "💸",
    guides: [
      { slug: "payouts/01-how-profit-splits-work", title: "How Profit Splits Work", description: "The 80/20 split explained — how your cut is calculated and when you qualify for 90/10." },
      { slug: "payouts/02-request-payout", title: "How to Request a Payout", description: "Submit a payout request from the Trader Dashboard and receive USDC on-chain automatically." },
      { slug: "payouts/03-payout-history-and-status", title: "Payout History and Status", description: "What pending, approved, settled, and rejected mean — and how to track your requests." },
    ],
  },
  {
    id: "lp-pool",
    label: "LP Pool",
    icon: "🏦",
    guides: [
      { slug: "lp/01-what-is-lp", title: "What is Liquidity Providing on ChainFunded?", description: "How the USDC pool backs trader payouts and how LPs earn from fees and firm cuts." },
      { slug: "lp/02-deposit", title: "How to Deposit as an LP", description: "Deposit USDC into the pool, sign two wallet transactions, and receive CFND tokens." },
      { slug: "lp/03-withdraw-claim", title: "How to Withdraw LP Capital and Claim Profits", description: "Redeem CFND tokens for USDC at current NAV, or claim yield without withdrawing principal." },
      { slug: "lp/04-lp-yield-explained", title: "LP Yield and Returns Explained", description: "How LP returns accrue, when they are claimable, and what affects NAV per token." },
      { slug: "lp/05-lp-dashboard-reference", title: "LP Dashboard: UI Reference", description: "Every section of the LP Dashboard — pool stats, your position, deposit/withdraw tabs, yield history." },
    ],
  },
  {
    id: "affiliate",
    label: "Affiliate",
    icon: "🤝",
    guides: [
      { slug: "affiliate/01-join-affiliate", title: "How to Join the Affiliate Program", description: "Connect your wallet to generate a referral code — no application required." },
      { slug: "affiliate/02-track-referrals", title: "How to Track Your Referral Performance", description: "Monitor clicks, sign-ups, and earned commissions from the Affiliate Dashboard." },
      { slug: "affiliate/03-claim-commissions", title: "Affiliate Commissions: How Payments Work", description: "Commissions are paid automatically on-chain — no claim, no minimum, no withdrawal request." },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: "🔒",
    guides: [
      { slug: "security/01-account-security", title: "How to Keep Your ChainFunded Account Secure", description: "Your wallet is your account — best practices for seed phrases, hardware wallets, and phishing." },
      { slug: "security/02-scams-and-safety", title: "Common Scams and How to Avoid Them", description: "The most common scams targeting prop trading platform users and how to spot them." },
      { slug: "security/03-smart-contract-transparency", title: "Smart Contract Transparency and Audits", description: "How to verify ChainFunded's contracts on Etherscan and what each contract does." },
    ],
  },
  {
    id: "common-questions",
    label: "Common Questions",
    icon: "❓",
    guides: [
      { slug: "common-questions/01-fees-and-payment", title: "Common Questions: Fees and Payment", description: "Phase 2 fees, USDC requirements, fee refunds, and gas costs." },
      { slug: "common-questions/02-trading-mechanics", title: "Common Questions: Trading Mechanics", description: "Market hours, leverage limits, instrument availability, and EA restrictions." },
      { slug: "common-questions/03-payouts-and-accounts", title: "Common Questions: Payouts and Funded Accounts", description: "Payout timing, the 50% single-day profit rule, and what happens after a breach." },
      { slug: "common-questions/04-liquidity-providing", title: "Common Questions: Liquidity Providing", description: "Minimum deposit, CFND token mechanics, LP risk, and how NAV is calculated." },
      { slug: "common-questions/05-platform-and-access", title: "Common Questions: Platform and Access", description: "Mobile access, lost wallet recovery, multiple accounts, and testnet details." },
    ],
  },
];

export const ALL_GUIDES = GUIDE_CATEGORIES.flatMap((c) => c.guides);
