import SEO from "@/components/SEO";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, HelpCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { useDefaultRules } from "@/hooks/useDefaultRules";

function buildCategories(r) {
  const p1 = r?.phase1Target ?? 10;
  const p2 = r?.phase2Target ?? 5;
  const dl = r?.maxDailyLoss ?? 5;
  const tl = r?.maxTotalLoss ?? 10;
  const md = r?.minTradingDays ?? 4;
  const bd = r?.maxBestDay ?? 50;
  const ts = r?.traderShare ?? 80;
  const fs = 100 - ts;

  return [
  {
    id: "getting-started",
    label: "Getting Started",
    questions: [
      {
        q: "What is ChainFunded?",
        a: "ChainFunded is a decentralised prop trading evaluation platform. We identify skilled traders through a two-phase challenge, then fund them with real simulated capital. What makes us different: all rules, fees, and payouts are enforced by smart contracts on-chain — no middlemen, no discretionary decisions.",
      },
      {
        q: "How do I get started?",
        a: "Connect your Web3 wallet (MetaMask or any WalletConnect-compatible wallet), select an account size on the Start Challenge page, and pay the one-time evaluation fee in USDC. Your Phase 1 challenge is activated immediately after the on-chain transaction confirms — usually within 30–90 seconds.",
      },
      {
        q: "Who can join ChainFunded?",
        a: "Anyone aged 18 or over with a Web3 wallet and USDC to cover the evaluation fee. We are open globally. You do not need to be a professional trader or have a prior track record — the challenge is your proof of skill.",
      },
      {
        q: "Do I need trading experience?",
        a: "No formal experience is required, but you do need to demonstrate consistent risk management and profitability across both challenge phases. We recommend familiarising yourself with the trading rules before paying the evaluation fee.",
      },
      {
        q: "Is ChainFunded a trustworthy platform?",
        a: "All core mechanics — fee collection, rule snapshots, and payout eligibility — are encoded in auditable smart contracts on the blockchain. You can verify every transaction on Etherscan. The LP pool that backs trader payouts is publicly visible and funded by independent liquidity providers.",
      },
    ],
  },
  {
    id: "the-challenge",
    label: "The Challenge",
    questions: [
      {
        q: "What account sizes are available?",
        a: "We offer six simulated account sizes: $1,000 ($30 fee), $10,000 ($155 fee), $25,000 ($250 fee), $50,000 ($345 fee), $100,000 ($540 fee), and $200,000 ($1,080 fee). All fees are paid in USDC and are non-refundable.",
      },
      {
        q: "How does the two-phase challenge work?",
        a: `Phase 1 (Challenge): Trade a simulated account and hit a ${p1}% profit target while respecting the daily and total loss limits. You must trade on at least ${md} separate calendar days.\n\nPhase 2 (Verification): Once Phase 1 is passed, you move to a fresh simulated account with the same size. The profit target drops to ${p2}%, with the same loss limits in place. Passing Phase 2 qualifies you for a funded account and on-chain payouts.`,
      },
      {
        q: "What is the minimum number of trading days?",
        a: "You must have at least 4 active trading days in each phase. There is no maximum — you can take as long as you need, though challenge accounts do not expire.",
      },
      {
        q: "Can I retake the challenge if I fail?",
        a: "Yes. If you violate a rule (daily loss, total loss, or any other restriction) you can purchase a new challenge at any time. Each attempt is a separate on-chain registration.",
      },
      {
        q: "Is the evaluation fee refunded after passing?",
        a: "The evaluation fee is not refunded as a direct rebate, but it is collected into the LP profit pool — a portion of which is distributed back to funded traders as part of the fee income cycle. The fee covers challenge infrastructure and is treated as a contribution to the ecosystem.",
      },
      {
        q: "What happens after passing Phase 2?",
        a: "Your Phase 2 results are automatically audited against the smart contract rules. If all conditions are met, a funded trading account is issued immediately — no manual review, no approval queue. All profit payouts on the funded account are processed on-chain via smart contract.",
      },
    ],
  },
  {
    id: "trading-rules",
    label: "Trading Rules",
    questions: [
      {
        q: "What are the core trading objectives?",
        a: `Phase 1: Reach a ${p1}% profit target on your starting balance.\nPhase 2: Reach a ${p2}% profit target on your starting balance.\n\nBoth phases share these risk limits:\n• Max Daily Loss: ${dl}% of the starting balance\n• Max Total Loss (drawdown): ${tl}% of the starting balance\n• Minimum Trading Days: ${md}\n• Consistency: no single trading day's profit may exceed ${bd}% of your total profit`,
      },
      {
        q: "How is the daily loss limit calculated?",
        a: `The daily loss limit is ${dl}% of your phase starting balance, calculated on a fixed-balance basis. For example, on a $50,000 account, you cannot lose more than $${(50000 * dl / 100).toLocaleString()} in a single trading day (midnight to midnight UTC). Both realised and unrealised losses count toward the limit.`,
      },
      {
        q: "How does the consistency rule work?",
        a: `Your single best trading day must account for no more than ${bd}% of your total profit. For example, on a $50,000 account that earned $5,000 across the phase, no single day can contribute more than $${(5000 * bd / 100).toLocaleString()}. The check is enforced on-chain at payout — if the best day exceeds ${bd}% of total profit, the claim reverts. Keep trading and the additional profitable days dilute your best day's share of the total, bringing the ratio back inside the cap. The rule rewards distributed performance over single lucky sessions; it does not block trades during the phase, only payout settlement.`,
      },
      {
        q: "What instruments can I trade?",
        a: "You can trade any currency pair or instrument available on the ChainFunded platform. There are no restrictions on asset class. However, strategies that exploit platform latency, data feed errors, or other technical loopholes are prohibited and will result in disqualification.",
      },
      {
        q: "Is news trading allowed?",
        a: "News trading is permitted. You may hold and open positions around high-impact news events. We do not impose a blackout window around news releases.",
      },
      {
        q: "Can I hold positions overnight or over the weekend?",
        a: "Yes, overnight and weekend positions are allowed. There are no swap or rollover fees, and no forced closure of positions.",
      },
      {
        q: "Are Expert Advisors (EAs) and algorithmic strategies allowed?",
        a: "Automated strategies and EAs are permitted provided they trade on genuine market conditions and do not exploit latency arbitrage, tick scalping, or other prohibited techniques. Grid and martingale strategies are allowed but carry elevated risk of hitting the drawdown limit.",
      },
    ],
  },
  {
    id: "funded-account",
    label: "Funded Account",
    questions: [
      {
        q: "What does a funded account look like?",
        a: `A funded account mirrors the size of the account you completed your challenge on. You trade under the same risk rules as Phase 2 (${dl}% daily loss, ${tl}% max drawdown). There is no separate evaluation — once approved, you trade and request payouts.`,
      },
      {
        q: "What is the profit split?",
        a: `You keep ${ts}% of all profits. ChainFunded retains ${fs}%, which flows into the LP profit pool and protocol treasury. The split is encoded in the smart contract.\n\nAccounts with 3 months of consistent payouts are eligible to scale to a 90/10 split in your favour.`,
      },
      {
        q: "Can I scale my account?",
        a: "A scaling plan is on the roadmap. Initially, funded accounts are issued at the size matching your challenge. We will announce scaling eligibility criteria when the feature launches.",
      },
      {
        q: "What happens if I breach a rule on a funded account?",
        a: "Breaching the daily loss or total drawdown limit on a funded account will result in the account being forfeit. To trade again, you will need to pass a new evaluation from Phase 1.",
      },
    ],
  },
  {
    id: "payouts",
    label: "Payouts & Withdrawals",
    questions: [
      {
        q: "How are payouts processed?",
        a: "Payouts are processed on-chain via the ChainFunded smart contract. Once a payout is approved, the USDC is transferred directly to your connected wallet address — no bank details, no third-party processors, no waiting for manual bank transfers.",
      },
      {
        q: "How often can I request a payout?",
        a: "You can submit a payout request at any time from the Payouts page in your Trader Hub. There is no manual review — once your request is validated against the smart contract rules (including the 50% single-day profit rule), the on-chain USDC transfer is executed instantly.",
      },
      {
        q: "Is there a minimum payout amount?",
        a: "There is no minimum payout threshold. You can request a payout for any amount of accrued profit at any time.",
      },
      {
        q: "What currency are payouts in?",
        a: "All payouts are in USDC (USD Coin), a stablecoin pegged 1:1 to the US Dollar. USDC is sent directly to the wallet address you used to register your challenge.",
      },
      {
        q: "Are there tax obligations on payouts?",
        a: "Tax treatment of trading income varies by jurisdiction. ChainFunded does not withhold tax and does not provide tax advice. You are responsible for declaring any income received in accordance with the laws of your country.",
      },
    ],
  },
  {
    id: "lp-pool",
    label: "LP Pool",
    questions: [
      {
        q: "What is the LP Pool?",
        a: "The Liquidity Provider (LP) Pool is the capital reserve that backs trader payouts. Independent investors deposit USDC into the pool and receive CFND tokens representing their share of the pool's net asset value. When a trader is paid out, capital comes from this pool.",
      },
      {
        q: "What are CFND tokens?",
        a: "CFND (ChainFunded) tokens are NAV-backed LP tokens. Their price in USDC tracks the pool's capital balance divided by total CFND supply. As the pool earns fee income, the NAV per token increases. CFND tokens can be burned at any time to redeem the underlying USDC.",
      },
      {
        q: "How do LPs earn yield?",
        a: "LPs earn a share of all challenge fees and the firm's 20% cut of trader profits. This income accumulates in the profit pool and is claimable at any time via the LP Dashboard. Yield is proportional to your share of total CFND supply.",
      },
      {
        q: "Is LP capital at risk?",
        a: "Yes. When a funded trader is paid out, the payout capital comes from the LP pool. If payouts exceed fee income over a period, the NAV per CFND token will decrease. This is the core risk/reward of being an LP — you are effectively acting as the counterparty to funded traders.",
      },
      {
        q: "How do I deposit into or withdraw from the LP Pool?",
        a: "Connect your wallet on the LP Pool page, enter a USDC amount, and click Deposit. You will sign two transactions: one to approve USDC spending and one to deposit. To withdraw, enter a USDC amount to redeem and click Withdraw — the corresponding CFND tokens are burned and USDC is returned to your wallet.",
      },
    ],
  },
  {
    id: "technical",
    label: "Technical",
    questions: [
      {
        q: "Which blockchain does ChainFunded use?",
        a: "ChainFunded is deployed on Ethereum Mainnet. All transactions, LP deposits, and payouts settle on-chain using USDC on Ethereum L1.",
      },
      {
        q: "Which wallets are supported?",
        a: "Any EVM-compatible wallet is supported, including MetaMask, Coinbase Wallet, Trust Wallet, and any WalletConnect-compatible wallet. Make sure your wallet is connected to the correct network.",
      },
      {
        q: "Can I verify the smart contracts?",
        a: "Yes. All contract addresses are published in our documentation and the source code is verifiable on Etherscan. The ChainFundedPool contract governs deposits, withdrawals, challenge registrations, and payouts.",
      },
      {
        q: "What if a transaction fails?",
        a: "Failed transactions do not deduct funds — gas may be spent but your USDC balance is not affected. If a transaction fails, check that you have sufficient USDC and ETH (for gas), and try again. If the issue persists, contact support with the failed transaction hash.",
      },
      {
        q: "Where can I get support?",
        a: "Reach us via the contact form on our website or through our official Discord and Telegram channels. For on-chain issues, always include your wallet address and transaction hash when reaching out.",
      },
    ],
  },
  {
    id: "affiliate",
    label: "Affiliate Program",
    questions: [
      {
        q: "How does the affiliate commission rate work?",
        a: "ChainFunded uses a sliding-scale commission: you earn between 8% and 20% of the first evaluation fee paid by each trader you refer. Your rate is determined by your total referred fee volume within the current calendar month — the more volume you generate, the higher your rate climbs for all fees that month.",
      },
      {
        q: "What are the commission tiers?",
        a: "There are five tiers based on monthly referred fee volume:\n\n• $0 – $999: 8%\n• $1,000 – $2,499: 10%\n• $2,500 – $4,999: 12%\n• $5,000 – $9,999: 15%\n• $10,000+: 20%\n\nReaching a higher tier applies retroactively to all fees referred that month — your rate for the month updates as your volume crosses each threshold.",
      },
      {
        q: "What counts as a qualifying referral?",
        a: "A qualifying referral is a new trader who visits ChainFunded via your referral link and pays their first evaluation fee. The commission is sent to your wallet in the same on-chain transaction — no claiming required.",
      },
      {
        q: "Do I earn commission on repeat challenge purchases?",
        a: "No. Commission is earned on the first evaluation fee paid by each referred trader only. If a trader you referred comes back to purchase another challenge, that subsequent fee does not generate a commission.",
      },
      {
        q: "When does my monthly volume reset?",
        a: "Your monthly volume resets at midnight on the 1st of each calendar month (UTC). Your rate for the new month starts at 8% and climbs as you accumulate more referred volume.",
      },
    ],
  },
];
}

function AccordionItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className={`border-b border-border last:border-0 transition-colors ${isOpen ? "bg-primary/3" : ""}`}>
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
        onClick={onToggle}
      >
        <span className={`text-sm font-medium leading-snug transition-colors ${isOpen ? "text-primary" : "text-foreground group-hover:text-primary"}`}>
          {question}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180 text-primary" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const { rules } = useDefaultRules();
  const CATEGORIES = buildCategories(rules);
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].id);
  const [openQuestion, setOpenQuestion] = useState(null);

  const category = CATEGORIES.find((c) => c.id === activeCat);

  const handleCatChange = (id) => {
    setActiveCat(id);
    setOpenQuestion(null);
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": CATEGORIES.flatMap((cat) =>
      cat.questions.map((item) => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.a,
        },
      }))
    ),
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <SEO
        title="FAQ — Frequently Asked Questions"
        description="Everything you need to know about ChainFunded: challenge rules, account sizes, payout process, LP deposits, and how on-chain prop trading works."
        canonical="/FAQ"
        jsonLd={faqJsonLd}
      />
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 text-primary text-xs font-medium">
          <HelpCircle className="w-3 h-3" /> Frequently Asked Questions
        </div>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          How can we <span className="gradient-text">help you?</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm">
          Everything you need to know about ChainFunded — the on-chain prop trading platform.
        </p>
      </div>

      {/* Body: sidebar + questions */}
      <div className="flex flex-col md:flex-row gap-6">

        {/* Mobile: horizontal scrollable tabs */}
        <div className="md:hidden overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-2 w-max">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCatChange(cat.id)}
                className={`whitespace-nowrap px-3 py-2 rounded-full text-xs font-medium transition-all ${
                  activeCat === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: category sidebar */}
        <aside className="hidden md:block md:w-52 shrink-0">
          <nav className="space-y-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCatChange(cat.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all ${
                  activeCat === cat.id
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <span>{cat.label}</span>
                {activeCat === cat.id && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
          </nav>

          {/* CTA */}
          <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs font-medium text-foreground">Ready to start?</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Pick an account size and launch your challenge today.
            </p>
            <Link to={createPageUrl("Onboarding")}>
              <Button size="sm" className="w-full bg-primary text-primary-foreground text-xs glow-green-sm">
                Start Challenge
              </Button>
            </Link>
          </div>
        </aside>

        {/* Accordion */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-secondary/20">
              <h2 className="text-sm font-semibold text-foreground">{category.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {category.questions.length} question{category.questions.length !== 1 ? "s" : ""}
              </p>
            </div>
            {category.questions.map((item, i) => (
              <AccordionItem
                key={i}
                question={item.q}
                answer={item.a}
                isOpen={openQuestion === i}
                onToggle={() => setOpenQuestion(openQuestion === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
