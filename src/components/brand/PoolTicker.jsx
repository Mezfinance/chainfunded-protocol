/**
 * PoolTicker — live protocol-backing strip.
 *
 * The single biggest "backed protocol, not an exchange" signal: shows the
 * real LP capital backing payouts, the current CFND NAV, and the count of
 * payouts settled on-chain — all read live from the pool contract.
 *
 * Props:
 *   className     — extra classes for the wrapper
 *   walletAddress — connected wallet, forwarded to the Proof panel
 */
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useChainFundedPool } from "@/hooks/useChainFundedPool";
import LightningMark from "@/components/brand/LightningMark";
import ProofPanel from "@/components/brand/ProofPanel";

function fmtUsd(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function Stat({ label, value, accent }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <span className={`font-mono text-xs font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

export default function PoolTicker({ className = "", walletAddress }) {
  const { tvlUsdc, totalPayoutsUsdc, payoutCount } = useProtocolStats();
  const { cfndPriceUsdc } = useChainFundedPool();

  return (
    <div className={`flex items-center gap-4 overflow-x-auto px-4 py-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <LightningMark className="w-3.5 h-3.5" color="#15803d" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Backed on-chain</span>
      </span>
      <span className="w-px h-3.5 bg-border shrink-0" />
      <Stat label="Pool TVL" value={fmtUsd(tvlUsdc)} accent />
      <span className="text-border">·</span>
      <Stat label="CFND NAV" value={cfndPriceUsdc != null ? `$${Number(cfndPriceUsdc).toFixed(3)}` : "—"} />
      <span className="text-border">·</span>
      <Stat label="Payouts settled" value={payoutCount != null ? payoutCount.toLocaleString() : "—"} />
      <span className="text-border">·</span>
      <Stat label="Paid to traders" value={fmtUsd(totalPayoutsUsdc)} />
      <span className="ml-auto shrink-0 pl-4">
        <ProofPanel walletAddress={walletAddress} />
      </span>
    </div>
  );
}
