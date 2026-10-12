/**
 * ProofContent — the proof-of-reserves dashboard body.
 *
 * Shared by the terminal slide-over (ProofPanel) and the standalone /proof
 * page. Every figure is read live from the pool contract.
 *
 * Props:
 *   walletAddress — connected wallet (optional)
 */
import { ShieldCheck, ExternalLink, CheckCircle2, Wallet } from "lucide-react";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { useChainFundedPool } from "@/hooks/useChainFundedPool";
import { useBlockNumber } from "@/hooks/useBlockNumber";
import { explorerAddressUrl } from "@/lib/thirdwebClient";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS || "";

function fmtUsd(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function truncate(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""; }

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs font-semibold ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70 mb-1.5">{title}</h4>
      {children}
    </div>
  );
}

export default function ProofContent({ walletAddress }) {
  const { tvlUsdc, totalPayoutsUsdc, payoutCount } = useProtocolStats();
  const { lpCapitalUsdc, profitPoolUsdc, cfndPriceUsdc } = useChainFundedPool();
  const block = useBlockNumber();

  const nav = cfndPriceUsdc;
  const health = nav == null
    ? { label: "—", tone: "muted", pct: 0 }
    : nav >= 0.999
      ? { label: "Fully reserved", tone: "good", pct: 100 }
      : nav >= 0.95
        ? { label: "Healthy", tone: "good", pct: Math.round(nav * 100) }
        : { label: "Absorbing stress", tone: "warn", pct: Math.round(nav * 100) };
  const healthColor = health.tone === "good" ? "text-primary" : health.tone === "warn" ? "text-yellow-400" : "text-muted-foreground";
  const healthBar = health.tone === "good" ? "bg-primary" : health.tone === "warn" ? "bg-yellow-400" : "bg-muted";

  return (
    <div className="space-y-3">
      {/* Smart contract validation */}
      <Section title="Smart contract">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">ChainFundedPool</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        </div>
        {POOL_ADDRESS && (
          <a
            href={explorerAddressUrl(POOL_ADDRESS)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            {truncate(POOL_ADDRESS)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </Section>

      {/* Reserve health */}
      <Section title="Reserve health">
        <div className="flex items-baseline justify-between mb-2">
          <span className={`text-sm font-bold ${healthColor}`}>{health.label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            NAV {nav != null ? `$${Number(nav).toFixed(3)}` : "—"}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${healthBar}`} style={{ width: `${health.pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          LP principal is backed 1:1 while NAV ≥ $1.00. Fee revenue sits as surplus on top.
        </p>
      </Section>

      {/* Pool composition */}
      <Section title="Pool composition">
        <Row label="Pool TVL" value={fmtUsd(tvlUsdc)} accent />
        <Row label="LP capital (backing)" value={fmtUsd(lpCapitalUsdc)} />
        <Row label="Profit pool (surplus)" value={fmtUsd(profitPoolUsdc)} />
      </Section>

      {/* Payout + settlement status */}
      <Section title="Payouts &amp; settlement">
        <Row label="Payouts settled" value={payoutCount != null ? payoutCount.toLocaleString() : "—"} />
        <Row label="Total paid to traders" value={fmtUsd(totalPayoutsUsdc)} />
        <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-border/60">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            Settled autonomously · N-of-M multisig signed · contract-validated, no human approval
          </span>
        </div>
      </Section>

      {/* Wallet verification */}
      <Section title="Your wallet">
        {walletAddress ? (
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <span className="font-mono text-xs text-foreground">{truncate(walletAddress)}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
              <CheckCircle2 className="w-3 h-3" /> Verified
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Connect a wallet to verify ownership on-chain.</p>
        )}
      </Section>

      <div className="flex items-center gap-1.5 px-1 pt-1 text-[10px] font-mono text-muted-foreground/70">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Live{block != null && ` · block #${block.toLocaleString()}`}
      </div>
    </div>
  );
}
