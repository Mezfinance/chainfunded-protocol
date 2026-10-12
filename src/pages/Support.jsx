import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  ScrollText,
  Send,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createPageUrl } from "@/utils";
import TOSContent from "@/components/legal/TOSContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { GUIDE_CATEGORIES } from "@/lib/guideData";

// ─── Contact channels ─────────────────────────────────────────────────────────

const SUPPORT_EMAIL = "support@chainfunded.io";
const DISCORD_URL = "https://discord.gg/EdYwteDTHq";
const X_URL = "https://x.com/chainfunded_io";

function DiscordIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.97 6.817H1.674l7.73-8.835L1.25 2.25h6.83l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
    </svg>
  );
}


// ─── FAQ data ────────────────────────────────────────────────────────────────

const CATEGORIES = [
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
        a: "Phase 1 (Challenge): Trade a simulated account and hit a 10% profit target while respecting the daily and total loss limits. You must trade on at least 4 separate calendar days.\n\nPhase 2 (Verification): Once Phase 1 is passed, you move to a fresh simulated account with the same size. The profit target drops to 5%, with the same loss limits in place. Passing Phase 2 qualifies you for a funded account and on-chain payouts.",
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
        a: "Phase 1: Reach a 10% profit target on your starting balance.\nPhase 2: Reach a 5% profit target on your starting balance.\n\nBoth phases share these risk limits:\n• Max Daily Loss: 5% of the starting balance\n• Max Total Loss (drawdown): 10% of the starting balance\n• Minimum Trading Days: 4",
      },
      {
        q: "How is the daily loss limit calculated?",
        a: "The daily loss limit is 5% of your phase starting balance, calculated on a fixed-balance basis. For example, on a $50,000 account, you cannot lose more than $2,500 in a single trading day (midnight to midnight UTC). Both realised and unrealised losses count toward the limit.",
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
        a: "A funded account mirrors the size of the account you completed your challenge on. You trade under the same risk rules as Phase 2 (5% daily loss, 10% max drawdown). There is no separate evaluation — once approved, you trade and request payouts.",
      },
      {
        q: "What is the profit split?",
        a: "You keep 80% of all profits. ChainFunded retains 20%, which flows into the LP profit pool and protocol treasury. The split is fixed and encoded in the smart contract — it cannot be changed retroactively.\n\nAccounts with 3 months of consistent payouts are eligible to scale to a 90/10 split in your favour.",
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

// ─── FAQ accordion item ───────────────────────────────────────────────────────

function AccordionItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className={`border-b border-border last:border-0 transition-colors ${isOpen ? "bg-primary/3" : ""}`}>
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
        onClick={onToggle}
      >
        <span
          className={`text-sm font-medium leading-snug transition-colors ${
            isOpen ? "text-primary" : "text-foreground group-hover:text-primary"
          }`}
        >
          {question}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
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

// ─── FAQ panel ────────────────────────────────────────────────────────────────

function FAQPanel({ activeCat, onCatChange }) {
  const [openQuestion, setOpenQuestion] = useState(null);

  const category = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0];

  // Reset open question when category changes
  useEffect(() => { setOpenQuestion(null); }, [activeCat]);

  return (
    <div className="space-y-6">
      {/* Mobile-only category scroll */}
      <div className="md:hidden overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1.5 pb-1" style={{ width: "max-content" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCatChange(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeCat === cat.id
                  ? "bg-primary/10 text-primary border border-primary/25"
                  : "text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Questions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/20">
          <h3 className="text-sm font-semibold text-foreground">{category.label}</h3>
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
  );
}

// ─── Legal panel wrapper ──────────────────────────────────────────────────────

function LegalPanel({ icon: Icon, badge, title, date, children }) {
  return (
    <div className="space-y-4">
      {/* Inline doc header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-lg font-grotesk font-semibold text-foreground">{title}</h2>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">Last modified: {date}</span>
      </div>

      {/* Content card */}
      <div className="bg-card border border-border rounded-xl p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}

// ─── Guide data ───────────────────────────────────────────────────────────────
// GUIDE_CATEGORIES and ALL_GUIDES are imported from @/lib/guideData

// ─── TOS / Privacy section indexes (for sidebar anchors) ─────────────────────

const TOS_SECTIONS = [
  { id: "tos-section-1",  label: "1. Introduction and Acceptance" },
  { id: "tos-section-2",  label: "2. Structural Disclosures" },
  { id: "tos-section-3",  label: "3. Eligibility" },
  { id: "tos-section-4",  label: "4. Wallet Connection" },
  { id: "tos-section-5",  label: "5. Prohibited Conduct" },
  { id: "tos-section-6",  label: "6. Intellectual Property" },
  { id: "tos-section-7",  label: "7. Third-Party Services" },
  { id: "tos-section-8",  label: "8. Disclaimers" },
  { id: "tos-section-9",  label: "9. Limitation of Liability" },
  { id: "tos-section-10", label: "10. Indemnification" },
  { id: "tos-section-11", label: "11. Suspension and Termination" },
  { id: "tos-section-12", label: "12. Risk Acknowledgement" },
  { id: "tos-section-13", label: "13. Governing Law and Disputes" },
  { id: "tos-section-14", label: "14. Miscellaneous" },
  { id: "tos-section-15", label: "15. What You Are Purchasing" },
  { id: "tos-section-16", label: "16. Challenge Rules" },
  { id: "tos-section-17", label: "17. Challenge Tiers and Fees" },
  { id: "tos-section-18", label: "18. Fee Policy" },
  { id: "tos-section-19", label: "19. Funded Accounts" },
  { id: "tos-section-20", label: "20. Payouts" },
  { id: "tos-section-21", label: "21. Acceptance Flow" },
  { id: "tos-section-22", label: "22. Consent Architecture" },
];

const PRIVACY_SECTIONS = [
  { id: "priv-section-1",  label: "1. Introduction" },
  { id: "priv-section-2",  label: "2. Information We Collect" },
  { id: "priv-section-3",  label: "3. How We Use Your Information" },
  { id: "priv-section-4",  label: "4. Cookies and Tracking" },
  { id: "priv-section-5",  label: "5. On-Chain Data" },
  { id: "priv-section-6",  label: "6. Information Sharing" },
  { id: "priv-section-7",  label: "7. Data Retention" },
  { id: "priv-section-8",  label: "8. Data Security" },
  { id: "priv-section-9",  label: "9. Your Rights" },
  { id: "priv-section-10", label: "10. International Data Transfers" },
  { id: "priv-section-11", label: "11. Children" },
  { id: "priv-section-12", label: "12. Changes to This Policy" },
  { id: "priv-section-13", label: "13. Governing Law" },
  { id: "priv-section-14", label: "14. Contact" },
];

// ─── Support sidebar ──────────────────────────────────────────────────────────

function SupportSidebar({ tab, onTabChange, faqCat, onFaqCat, guideCat, onGuideCat, onOpenGuide }) {
  const SECTIONS = [
    { id: "faq",     label: "FAQ",              icon: HelpCircle  },
    { id: "guides",  label: "How-To Guides",    icon: BookOpen    },
    { id: "contact", label: "Contact",          icon: Mail        },
    { id: "tos",     label: "Terms of Service", icon: ScrollText  },
    { id: "privacy", label: "Privacy Policy",   icon: ShieldCheck },
  ];

  const [expandedCats, setExpandedCats] = useState(new Set());

  const toggleCat = (catId) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start gap-5 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-1">
      <nav className="space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id;
          return (
            <div key={id}>
              {/* Section header */}
              <button
                onClick={() => onTabChange(id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>

              {/* FAQ sub-nav */}
              {isActive && id === "faq" && (
                <div className="mt-1 ml-2 pl-3 border-l border-border space-y-0.5 py-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => onFaqCat(cat.id)}
                      className={`w-full flex items-center justify-between gap-1 px-2.5 py-2 rounded text-[0.8rem] text-left transition-colors ${
                        faqCat === cat.id
                          ? "text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="truncate">{cat.label}</span>
                      {faqCat === cat.id && <ChevronRight className="w-3 h-3 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Guides sub-nav — accordion */}
              {isActive && id === "guides" && (
                <div className="mt-1 ml-2 pl-3 border-l border-border py-1 space-y-0.5">
                  {GUIDE_CATEGORIES.map((cat) => {
                    const isExpanded = expandedCats.has(cat.id);
                    return (
                      <div key={cat.id}>
                        <button
                          onClick={() => toggleCat(cat.id)}
                          className="w-full flex items-center justify-between gap-1 px-2.5 py-2 rounded text-[0.8rem] text-left transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <span className="truncate">{cat.icon} {cat.label}</span>
                          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="ml-2 pl-2.5 border-l border-border/50 space-y-0.5 my-1">
                            {cat.guides.map((guide) => (
                              <button
                                key={guide.slug}
                                onClick={() => onOpenGuide(guide.slug)}
                                className="w-full text-left px-2.5 py-2 rounded text-xs leading-snug transition-colors text-muted-foreground hover:text-foreground"
                              >
                                {guide.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TOS section anchors */}
              {isActive && id === "tos" && (
                <div className="mt-1 ml-2 pl-3 border-l border-border space-y-0.5 py-1">
                  {TOS_SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      className="w-full text-left px-2.5 py-2 rounded text-[0.8rem] text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Privacy section anchors */}
              {isActive && id === "privacy" && (
                <div className="mt-1 ml-2 pl-3 border-l border-border space-y-0.5 py-1">
                  {PRIVACY_SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      className="w-full text-left px-2.5 py-2 rounded text-[0.8rem] text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* CTA */}
      <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground">Ready to start?</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3.5">Pick an account size and launch your challenge today.</p>
        <Link to={createPageUrl("Onboarding")}>
          <Button size="sm" className="w-full bg-primary text-primary-foreground text-xs glow-green-sm">
            Start Challenge
          </Button>
        </Link>
      </div>
    </aside>
  );
}

// ─── Guides panel ─────────────────────────────────────────────────────────────

function GuidesPanel({ guideCat, onOpenGuide, onGuideCat }) {
  const visibleCategories = guideCat
    ? GUIDE_CATEGORIES.filter((c) => c.id === guideCat)
    : GUIDE_CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Mobile-only category scroll */}
      <div className="md:hidden overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1.5 pb-1" style={{ width: "max-content" }}>
          <button
            onClick={() => onGuideCat(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              guideCat === null
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground border border-border hover:text-foreground"
            }`}
          >
            All
          </button>
          {GUIDE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onGuideCat(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                guideCat === cat.id
                  ? "bg-primary/10 text-primary border border-primary/25"
                  : "text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guide category grid */}
      <div className="space-y-6">
        {visibleCategories.map((cat) => (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base leading-none">{cat.icon}</span>
              <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
              <span className="text-xs text-muted-foreground">({cat.guides.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cat.guides.map((guide, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenGuide(guide.slug)}
                  className="group flex items-start justify-between gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-primary/3 active:bg-primary/5 active:border-primary/40 transition-all text-left w-full"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
                      {guide.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{guide.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-0.5" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Contact panel ────────────────────────────────────────────────────────────

function ChannelCard({ icon, title, subtitle, href, onClick, action }) {
  const inner = (
    <div className="group flex items-start gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-primary/3 transition-all h-full">
      <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 break-words">{subtitle}</p>
      </div>
      {action}
    </div>
  );

  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      {inner}
    </button>
  );
}

function ContactPanel() {
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", company: "" });
  const [sending, setSending] = useState(false);

  const copyEmail = () => {
    navigator.clipboard?.writeText(SUPPORT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Please fill in your name, email, and a message.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Message sent — we'll get back to you soon.");
        setForm({ name: "", email: "", subject: "", message: "", company: "" });
      } else if (res.status === 503 && data.fallback) {
        toast.error(`Form unavailable right now — please email ${data.fallback} directly.`);
      } else {
        toast.error(data.error || "Could not send your message. Please try again.");
      }
    } catch {
      toast.error(`Could not reach the server — please email ${SUPPORT_EMAIL} directly.`);
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    "w-full bg-secondary/30 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="space-y-6">
      {/* Channels */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Reach us directly</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChannelCard
            icon={<Mail className="w-4 h-4" />}
            title="Email"
            subtitle={SUPPORT_EMAIL}
            href={`mailto:${SUPPORT_EMAIL}`}
            action={
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); copyEmail(); }}
                className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Copy email address"
                aria-label="Copy email address"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            }
          />
          <ChannelCard
            icon={<MessageCircle className="w-4 h-4" />}
            title="AI Support Assistant"
            subtitle="Instant answers, 24/7"
            onClick={() => window.dispatchEvent(new Event("open-support-chat"))}
          />
          <ChannelCard
            icon={<DiscordIcon className="w-4 h-4" />}
            title="Discord"
            subtitle="Join the community & get help"
            href={DISCORD_URL}
          />
          <ChannelCard
            icon={<XIcon className="w-4 h-4" />}
            title="X (Twitter)"
            subtitle="@chainfunded_io"
            href={X_URL}
          />
        </div>
      </div>

      {/* Contact form */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/20">
          <h3 className="text-sm font-semibold text-foreground">Send us a message</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            For on-chain issues, include your wallet address and the transaction hash. We typically reply within 1–2 business days.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Honeypot — hidden from users, catches bots */}
          <input
            type="text"
            name="company"
            value={form.company}
            onChange={update("company")}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="contact-name" className="text-xs font-medium text-muted-foreground">Name</label>
              <input id="contact-name" type="text" value={form.name} onChange={update("name")} className={inputCls} placeholder="Your name" maxLength={100} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="contact-email" className="text-xs font-medium text-muted-foreground">Email</label>
              <input id="contact-email" type="email" value={form.email} onChange={update("email")} className={inputCls} placeholder="you@example.com" maxLength={200} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-subject" className="text-xs font-medium text-muted-foreground">Subject <span className="text-muted-foreground/50">(optional)</span></label>
            <input id="contact-subject" type="text" value={form.subject} onChange={update("subject")} className={inputCls} placeholder="What's this about?" maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-message" className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea id="contact-message" value={form.message} onChange={update("message")} className={`${inputCls} resize-y min-h-[120px]`} placeholder="How can we help?" maxLength={5000} required />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Prefer email? <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>
            </p>
            <Button type="submit" disabled={sending} className="bg-primary text-primary-foreground glow-green-sm gap-2">
              {sending ? <BoltLoader className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Support page ─────────────────────────────────────────────────────────────

export default function Support() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get("tab") ?? "faq";
  const slug = searchParams.get("slug") ?? null;

  // Redirect old ?tab=guides&slug= URLs to clean /guides/ paths
  useEffect(() => {
    if (slug) navigate(`/guides/${slug}`, { replace: true });
  }, [slug, navigate]);

  const [faqCat, setFaqCat] = useState(CATEGORIES[0].id);
  const [guideCat, setGuideCat] = useState(null);

  const handleTabChange = (value) => {
    setSearchParams(value === "faq" ? {} : { tab: value });
  };

  const handleOpenGuide = (s) => navigate(`/guides/${s}`);
  const handleBackToGuides = () => setSearchParams({ tab: "guides" });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <SEO
        title="Support — Help Centre"
        description="Get help with ChainFunded: browse trading guides, challenge rules, payout process, and frequently asked questions. Contact our support team for anything else."
        canonical="/Support"
      />
      {/* Page header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 text-primary text-xs font-medium">
          <LifeBuoy className="w-3 h-3" /> Support Centre
        </div>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          Support &amp; <span className="gradient-text">Legal</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm">
          Find answers to common questions, review our legal documentation, or get in touch with our team.
        </p>
      </div>

      {/* Tabs — visible on mobile only; desktop uses sidebar */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="md:hidden overflow-x-auto flex justify-start">
          <TabsList className="bg-secondary/50 border border-border h-auto p-1 gap-1 inline-flex shrink-0">
            <TabsTrigger
              value="faq"
              className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2 whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5" /> FAQ
            </TabsTrigger>
            <TabsTrigger
              value="guides"
              className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2 whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" /> How-To Guides
            </TabsTrigger>
            <TabsTrigger
              value="contact"
              className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2 whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" /> Contact
            </TabsTrigger>
            <TabsTrigger
              value="tos"
              className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2 whitespace-nowrap"
            >
              <ScrollText className="w-3.5 h-3.5" /> Terms of Service
            </TabsTrigger>
            <TabsTrigger
              value="privacy"
              className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none px-4 py-2 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Privacy Policy
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Sidebar + content */}
        <div className="mt-8 flex gap-8 items-start">
          <SupportSidebar
            tab={tab}
            onTabChange={handleTabChange}
            faqCat={faqCat}
            onFaqCat={setFaqCat}
            guideCat={guideCat}
            onGuideCat={setGuideCat}
            onOpenGuide={handleOpenGuide}
          />

          <div className="flex-1 min-w-0">
            <TabsContent value="faq" className="mt-0">
              <FAQPanel activeCat={faqCat} onCatChange={setFaqCat} />
            </TabsContent>

            <TabsContent value="guides" className="mt-0">
              <GuidesPanel
                guideCat={guideCat}
                onOpenGuide={handleOpenGuide}
                onGuideCat={setGuideCat}
              />
            </TabsContent>

            <TabsContent value="contact" className="mt-0">
              <ContactPanel />
            </TabsContent>

            <TabsContent value="tos" className="mt-0">
              <LegalPanel
                icon={ScrollText}
                badge="Terms of Service"
                title="Terms of Service"
                date="March 24, 2026"
              >
                <TOSContent />
              </LegalPanel>
            </TabsContent>

            <TabsContent value="privacy" className="mt-0">
              <LegalPanel
                icon={ShieldCheck}
                badge="Privacy Policy"
                title="Privacy Policy"
                date="March 24, 2026"
              >
                <PrivacyContent />
              </LegalPanel>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
