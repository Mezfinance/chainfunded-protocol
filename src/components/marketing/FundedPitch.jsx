/**
 * FundedPitch — the full "payouts in seconds" landing experience: brand header,
 * hero (live payout receipt + seconds-vs-weeks), smart-contract explainer,
 * single "Start your challenge" CTA with the rules expander, and a risk/legal
 * footer. Returns a fragment (the host provides the page/overlay wrapper).
 *
 * The CTA adapts to where it's used:
 *   • `startHref`  → renders as a <Link> (standalone /Funded page)
 *   • `onStart`    → renders as a <button> that reveals the challenge flow
 *                    in place (cold-ad intro on /Onboarding, no navigation)
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, FileCode2, ChevronDown, Zap, Wallet, Lock, ExternalLink,
} from "lucide-react";
import LightningMark from "@/components/brand/LightningMark";
import PayoutReceipt from "@/components/marketing/PayoutReceipt";
import { explorerAddressUrl } from "@/lib/thirdwebClient";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS || "";

const RULES = [
  ["Phase 1 target", "10%"],
  ["Phase 2 target", "5%"],
  ["Max daily loss", "5%"],
  ["Max total loss", "10%"],
  ["Min trading days", "4 / phase"],
  ["Profit split", "80% / 20%"],
  ["Consistency", "Best day ≤ 50% of total profit"],
];

function StartButton({ startHref, onStart, className, children }) {
  return onStart ? (
    <Button onClick={onStart} size="lg" className={className}>{children}</Button>
  ) : (
    <Link to={startHref}><Button size="lg" className={className}>{children}</Button></Link>
  );
}

export default function FundedPitch({ startHref, onStart }) {
  const [showRules, setShowRules] = useState(false);
  const heroCta = "bg-primary text-primary-foreground hover:bg-primary/90 glow-green-sm font-grotesk font-semibold px-8 text-base h-12";
  const bottomCta = "bg-primary text-primary-foreground hover:bg-primary/90 glow-green font-grotesk font-semibold px-10 text-base h-12";

  return (
    <>
      {/* Minimal brand header (no nav — fewer exits) */}
      <header className="flex items-center gap-2 px-6 sm:px-10 py-5 max-w-6xl mx-auto">
        <LightningMark className="w-7 h-7" color="#15803d" />
        <span className="font-grotesk font-bold text-lg tracking-tight">ChainFunded</span>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 max-w-6xl mx-auto pt-8 sm:pt-14 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — message */}
          <div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary mb-5">
              <Zap className="w-3.5 h-3.5" /> On-chain prop trading
            </span>
            <h1 className="font-grotesk text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05]">
              Payouts in <span className="gradient-text">seconds</span>.<br />Not weeks.
            </h1>
            <p className="mt-6 text-muted-foreground text-base sm:text-lg leading-relaxed max-w-lg">
              Pass the challenge and a smart contract sends 80% of the profit from your funded
              account straight to your wallet in USDC — settled on-chain in a single block.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <StartButton startHref={startHref} onStart={onStart} className={heroCta}>
                Start your challenge <ArrowRight className="w-4 h-4 ml-1" />
              </StartButton>
              <span className="font-mono text-[11px] text-muted-foreground/70">
                Ethereum mainnet · Paid in USDC · You keep custody
              </span>
            </div>
          </div>

          {/* Right — live "settling → executed" payout receipt */}
          <div className="relative">
            <PayoutReceipt />

            {/* Seconds-vs-weeks contrast */}
            <div className="mt-6 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Traditional prop firms</span>
                  <span className="font-mono text-[11px] text-muted-foreground/70">2–6 weeks</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full w-full rounded-full bg-muted-foreground/40" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-foreground font-medium">ChainFunded</span>
                  <span className="font-mono text-[11px] text-primary">~12 seconds</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: "3%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Smart-contract explainer ─────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-16 border-t border-border bg-card/30">
        <div className="max-w-3xl mx-auto text-center">
          <FileCode2 className="w-7 h-7 text-primary mx-auto mb-4" />
          <h2 className="font-grotesk text-3xl sm:text-4xl font-bold">The contract pays you. Not us.</h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            When you pass, the trading engine signs a proof of your performance. You submit it
            on-chain, and the <span className="font-mono text-foreground/80">ChainFundedPool</span> contract
            verifies the signature and every rule itself — then transfers your USDC in the same
            transaction. We can’t delay it, gate it, or quietly decide not to. It’s enforced by code
            you can read, line by line.
          </p>
          <div className="mt-8">
            <Link to={createPageUrl("ContractExplorer")}>
              <Button size="lg" variant="outline" className="border-primary/40 text-foreground hover:bg-primary/10 font-semibold gap-2">
                <FileCode2 className="w-4 h-4" /> Read the smart contract
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Start section (single CTA + rules expander) ──────────────────── */}
      <section className="px-6 sm:px-10 py-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-grotesk text-3xl sm:text-4xl font-bold">Get funded</h2>
          <p className="mt-4 text-muted-foreground">
            Prove your edge across two phases. Trade simulated capital. Get paid in USDC, on-chain.
          </p>

          <div className="mt-8">
            <StartButton startHref={startHref} onStart={onStart} className={bottomCta}>
              Start your challenge <ArrowRight className="w-4 h-4 ml-1" />
            </StartButton>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Connect your own wallet</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Self-custodied</span>
          </div>

          {/* Rules — tucked away, available on demand */}
          <div className="mt-10 text-left">
            <button
              onClick={() => setShowRules((v) => !v)}
              className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See the rules
              <ChevronDown className={`w-4 h-4 transition-transform ${showRules ? "rotate-180" : ""}`} />
            </button>
            {showRules && (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/50 p-5">
                {RULES.map(([label, value]) => (
                  <div key={label} className={`flex flex-col ${label === "Consistency" ? "col-span-2" : ""}`}>
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold text-foreground">{value}</span>
                  </div>
                ))}
                <p className="col-span-2 mt-1 text-[11px] text-muted-foreground/70 leading-relaxed">
                  Industry-standard 2-phase evaluation. Breaching the daily or total loss limit fails the
                  challenge. Consistency rule checked at payout. Full rules are shown before you pay.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Minimal footer (risk + legal, no nav) ────────────────────────── */}
      <footer className="px-6 sm:px-10 py-10 border-t border-border">
        <div className="max-w-3xl mx-auto space-y-4 text-center">
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            ChainFunded is a simulated trading challenge platform. Account balances are simulated; the
            evaluation fee is the only real money you pay and is non-refundable once paid on-chain. LP
            capital backs trader payouts and is at risk. Nothing here is financial advice.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/60">
            <Link to="/terms-of-service" className="hover:text-muted-foreground transition-colors">Terms</Link>
            <span>·</span>
            <Link to="/privacy-policy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            {POOL_ADDRESS && (
              <>
                <span>·</span>
                <a
                  href={explorerAddressUrl(POOL_ADDRESS)}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:text-muted-foreground transition-colors break-all"
                >
                  Contract <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </div>
      </footer>
    </>
  );
}
