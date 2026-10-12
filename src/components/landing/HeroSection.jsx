import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, ExternalLink } from "lucide-react";
import AssetTicker from "@/components/landing/AssetTicker";
import HeroReviewsBadge from "@/components/landing/HeroReviewsBadge";

const CONTRACT_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const ETHERSCAN_URL = CONTRACT_ADDRESS
  ? `https://etherscan.io/address/${CONTRACT_ADDRESS}`
  : "https://etherscan.io";

// ── Hero section ───────────────────────────────────────────────────────────────
export default function HeroSection() {
  return (
    <section className="relative min-h-[calc(100vh-200px)] flex flex-col overflow-hidden">
      {/* subtle green glow, top-centre */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-primary/5 blur-3xl" />

      {/* Markets ticker sits at the very top of the hero */}
      <AssetTicker borderClass="border-b" />

      {/* Hero content — squeezed toward the top (eyebrow → headline → CTAs) */}
      <div className="flex-1 flex items-start justify-center px-6 pt-6 sm:pt-16 pb-10 sm:pb-16">
        <div className="max-w-4xl mx-auto w-full flex flex-col items-center text-center">

          {/* Social-proof eyebrow, tight above the headline */}
          <HeroReviewsBadge />

          <h1 className="font-grotesk text-[2.4rem] sm:text-6xl lg:text-[5.25rem] font-bold leading-[1.06] text-foreground mb-6 sm:mb-8">
            The prop firm<br />
            <span className="text-primary">that can&apos;t choose</span><br />
            not to pay you.
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground leading-relaxed mb-7 sm:mb-12 max-w-2xl mx-auto">
            Pass the challenge. The contract verifies your performance
            and sends USDC to your wallet automatically. No email.
            No approval queue.
          </p>

          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link to={createPageUrl("Onboarding")} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 glow-green-sm font-grotesk font-semibold h-14 px-9 text-base sm:text-lg"
              >
                Start a Challenge →
              </Button>
            </Link>
            <Link to={createPageUrl("ContractExplorer")} className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-border text-foreground/80 hover:text-foreground font-grotesk font-semibold h-14 px-9 text-base sm:text-lg gap-2"
              >
                Read the contract <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {CONTRACT_ADDRESS && (
            <a
              href={ETHERSCAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 font-mono text-[11px] sm:text-xs text-muted-foreground/50 hover:text-primary transition-colors break-all"
              title="View the verified contract on Etherscan"
            >
              {CONTRACT_ADDRESS}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          )}

        </div>
      </div>
    </section>
  );
}
