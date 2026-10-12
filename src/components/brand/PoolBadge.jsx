/**
 * PoolBadge — verified on-chain pool address chip.
 *
 * Surfaces the ChainFundedPool contract address with a verified check and a
 * link to the block explorer. The brand's core differentiator made tactile:
 * a generic exchange never shows you the contract its money lives in.
 *
 * Props:
 *   className — extra classes
 *   compact   — icon + truncated address only (for tight headers)
 */
import { ShieldCheck } from "lucide-react";
import { explorerAddressUrl } from "@/lib/thirdwebClient";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS || "";

function truncate(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export default function PoolBadge({ className = "", compact = false }) {
  if (!POOL_ADDRESS) return null;
  return (
    <a
      href={explorerAddressUrl(POOL_ADDRESS)}
      target="_blank"
      rel="noopener noreferrer"
      title={`ChainFundedPool · ${POOL_ADDRESS} — verify on-chain`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 transition-colors hover:border-primary/50 hover:bg-primary/10 ${className}`}
    >
      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
      {!compact && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pool</span>
      )}
      <span className="font-mono text-[11px] text-foreground/90">{truncate(POOL_ADDRESS)}</span>
    </a>
  );
}
