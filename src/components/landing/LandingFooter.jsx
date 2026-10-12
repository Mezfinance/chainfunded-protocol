import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createPageUrl as _cpu } from "@/utils";
import { ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import ManageCookiesLink from "@/components/ManageCookiesLink";

const CONTRACT_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const ETHERSCAN_URL = CONTRACT_ADDRESS
  ? `https://etherscan.io/address/${CONTRACT_ADDRESS}`
  : "https://etherscan.io";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">

      {/* CTA band */}
      <div className="px-6 sm:px-10 lg:px-16 py-20 border-b border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <div>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              Ready to trade<br />for real?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              From $20 USDC. No subscription. Payout in seconds.
            </p>
          </div>
          <Link to={createPageUrl("Onboarding")} className="flex-shrink-0">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-green-sm font-grotesk font-semibold px-8 text-base"
            >
              Start a Challenge →
            </Button>
          </Link>
        </div>
      </div>

      {/* links + legal */}
      <div className="px-6 sm:px-10 lg:px-16 py-10">
        <div className="max-w-7xl mx-auto">

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-10 mb-10">

            {/* brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-grotesk font-bold text-foreground">
                  Chain<span className="text-primary">Funded</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
                On-chain prop trading evaluation.
                Ethereum mainnet.
              </p>
              {CONTRACT_ADDRESS && (
                <a
                  href={ETHERSCAN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/50 hover:text-primary transition-colors group"
                >
                  <span className="truncate max-w-[200px]">{CONTRACT_ADDRESS}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              )}
            </div>

            {/* nav links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-16 gap-y-2">
              {[
                { label: "Trader Hub",  page: "TraderDashboard" },
                { label: "Trading Terminal", page: "TradingTerminal" },
                { label: "LP Pool",     page: "LPDashboard" },
                { label: "CFG Rewards", page: "CfgRewards" },
                { label: "Affiliate",   page: "AffiliateDashboard" },
                { label: "Reviews",     page: "Reviews" },
                { label: "Support",     page: "Support" },
                { label: "FAQ",         page: "FAQ" },
                { label: "Proof of Reserves", page: "Proof" },
                { label: "Whitepaper",  page: "Whitepaper" },
                { label: "Legal",       page: "Legal" },
                { label: "Privacy",     page: "PrivacyPolicy" },
                { label: "Terms",       page: "TermsOfService" },
              ].map(({ label, page }) => (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
              <a
                href="https://discord.gg/EdYwteDTHq"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Discord ↗
              </a>
              <a
                href="https://chainfundeddao.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                ChainFunded DAO ↗
              </a>
              <ManageCookiesLink className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors text-left" />
            </div>
          </div>

          {/* risk warning */}
          <div className="border-t border-border pt-8 space-y-3">
            <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-4xl">
              <span className="font-medium text-muted-foreground">Risk Warning:</span>{" "}
              ChainFunded is a simulated trading challenge platform. All account balances,
              P&L, and positions are simulated and do not represent real market exposure.
              The challenge fee is the only real money paid. LP deposits back real trader
              payouts and are subject to partial or total loss. Challenge fees are
              non-refundable once paid on-chain. Past performance does not guarantee
              future results.
            </p>
            <p className="text-xs text-muted-foreground/40 leading-relaxed max-w-4xl">
              By using ChainFunded you confirm you have read and agree to the trading rules.
              Payouts require passing all rule compliance checks, verified autonomously on-chain.
              ChainFunded is not a regulated financial service. Nothing on this platform
              constitutes financial advice.
            </p>
          </div>

        </div>
      </div>

    </footer>
  );
}
