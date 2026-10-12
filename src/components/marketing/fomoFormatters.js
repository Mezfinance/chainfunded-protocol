import { TrendingUp, Trophy, Wallet, Sparkles, BarChart3 } from "lucide-react";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "Anonymous";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsdc(n) {
  if (n == null || Number.isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n) {
  const abs = Math.abs(n);
  const formatted = abs >= 1_000 ? `${(abs / 1_000).toFixed(1)}K` : abs.toFixed(0);
  return `${n >= 0 ? "+" : "−"}$${formatted}`;
}

export function formatFomoEvent(event) {
  switch (event.type) {
    case "challenge":
      return {
        icon: Sparkles,
        accent: "text-emerald-400",
        title: `${shortAddr(event.address)} bought a ${formatUsdc(event.sizeUsdc)} Challenge`,
        subtitle: event.phase === 2 ? "Phase 2 entry" : "Evaluation started",
      };
    case "payout":
      return {
        icon: Trophy,
        accent: "text-amber-400",
        title: `${shortAddr(event.address)} just received ${formatUsdc(event.amountUsdc)}`,
        subtitle: "Payout settled on-chain",
      };
    case "lp_deposit":
      return {
        icon: Wallet,
        accent: "text-sky-400",
        title: `LP ${shortAddr(event.address)} deposited ${formatUsdc(event.amountUsdc)}`,
        subtitle: "Funded the rewards pool",
      };
    case "funded":
      return {
        icon: TrendingUp,
        accent: "text-emerald-400",
        title: `${shortAddr(event.address)} got funded — ${formatUsdc(event.sizeUsdc)} account`,
        subtitle: "Phase 2 cleared",
      };
    case "trade": {
      const dir = event.direction === "short" ? "Short" : "Long";
      const who = event.address ? shortAddr(event.address) : "A trader";
      return {
        icon: BarChart3,
        accent: event.pnl >= 0 ? "text-emerald-400" : "text-rose-400",
        title: `${who} closed ${dir} ${event.symbol} ${formatPnl(event.pnl)}`,
        subtitle: "Trade settled on the platform",
      };
    }
    default:
      return null;
  }
}
