/**
 * Proof — standalone proof-of-reserves / transparency page.
 *
 * Public-facing surface that makes ChainFunded's differentiators legible:
 * the pool that backs payouts, reserve health, settlement model, and the
 * verified contract — all read live from chain. Shares its body with the
 * terminal's Proof slide-over via ProofContent.
 */
import SEO from "@/components/SEO";
import { useAuth } from "@/lib/AuthContext";
import LightningMark from "@/components/brand/LightningMark";
import ProofContent from "@/components/brand/ProofContent";

export default function Proof() {
  const { address } = useAuth();

  return (
    <>
      <SEO
        title="Proof of Reserves — ChainFunded"
        description="ChainFunded's payout pool, reserve health, settlement model, and verified smart contract — read live from Ethereum mainnet."
      />
      <div className="max-w-2xl mx-auto">
        {/* Hero */}
        <div className="flex items-center gap-3 mb-3">
          <LightningMark className="w-8 h-8" color="#15803d" />
          <div>
            <h1 className="font-grotesk text-2xl font-bold text-foreground leading-tight">
              Proof of Reserves
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
              The first transparent on-chain prop infrastructure
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6 max-w-prose">
          Trader payouts are backed by a real on-chain pool and settled by a smart
          contract — not a compliance desk. Every figure below is read live from the
          deployed <span className="font-mono text-foreground/80">ChainFundedPool</span> contract.
          Don't trust — verify.
        </p>

        <ProofContent walletAddress={address} />
      </div>
    </>
  );
}
