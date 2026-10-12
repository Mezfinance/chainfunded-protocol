/**
 * Funded — standalone campaign landing page (ad destination for the
 * "payouts in seconds" creative). Rendered WITHOUT the site nav/footer (see
 * App.jsx) for a focused, low-exit funnel. The body is the shared FundedPitch,
 * which is also mounted on /Onboarding for cold paid-ad traffic.
 */
import SEO from "@/components/SEO";
import { useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FundedPitch from "@/components/marketing/FundedPitch";

export default function Funded() {
  const { search } = useLocation();
  // Preserve ad attribution (utm_*, twclid) when handing off to onboarding.
  const startHref = createPageUrl("Onboarding") + search;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Get funded — payouts in seconds, on-chain | ChainFunded"
        description="Pass the challenge and a smart contract pays your USDC straight to your wallet — settled on-chain in one block. No payout desk, no approval queue."
        canonical="/Funded"
      />
      <FundedPitch startHref={startHref} />
    </div>
  );
}
