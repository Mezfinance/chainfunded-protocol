import { ShoppingCart, TrendingUp, Trophy, Coins, Megaphone, Wrench, Landmark } from "lucide-react";
import TradeShareCard from "./TradeShareCard";
import { formatUtcDateTime } from "@/lib/datetime";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "anon";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsd(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

const KIND_META = {
  challenge_buy: { icon: ShoppingCart, label: "Challenge purchased", colour: "text-indigo-400 border-indigo-500/30 bg-indigo-500/5" },
  phase2:        { icon: TrendingUp,   label: "Cleared Phase 1",     colour: "text-amber-400  border-amber-500/30  bg-amber-500/5" },
  funded:        { icon: Trophy,       label: "New Funded Trader",   colour: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
  payout:        { icon: Coins,        label: "Payout settled",      colour: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
  governance:    { icon: Landmark,     label: "Governance proposal", colour: "text-purple-400 border-purple-500/30 bg-purple-500/5" },
  maintenance:   { icon: Wrench,       label: "Platform notice",     colour: "text-sky-400    border-sky-500/30    bg-sky-500/5" },
  announcement:  { icon: Megaphone,    label: "Announcement",        colour: "text-sky-400    border-sky-500/30    bg-sky-500/5" },
};

/**
 * Renders an `is_system=true` message based on its payload.kind.
 * Falls back to the plain content text for unknown kinds.
 */
export default function SystemMessageCard({ message }) {
  const kind = message.system_payload?.kind;
  const payload = message.system_payload || {};
  const time = formatUtcDateTime(message.created_at);

  // Big-trade auto-shares reuse the user trade-share card.
  if (kind === "trade_share") {
    return (
      <div className="py-1.5 px-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 mb-1">
          <Trophy className="w-3 h-3 text-amber-400" />
          <span className="uppercase tracking-wider font-bold">Big Move</span>
          <span>· {time}</span>
        </div>
        <TradeShareCard payload={payload} />
      </div>
    );
  }

  const meta = KIND_META[kind] || KIND_META.announcement;
  const Icon = meta.icon;

  let line;
  switch (kind) {
    case "challenge_buy":
      line = <>{shortAddr(payload.trader)} bought a <strong>{fmtUsd(payload.account_size)}</strong> Phase 1 Challenge</>;
      break;
    case "phase2":
      line = <>{shortAddr(payload.trader)} cleared <strong>Phase 1</strong> · {fmtUsd(payload.account_size)} account</>;
      break;
    case "funded":
      line = <>{shortAddr(payload.trader)} is now <strong>FUNDED</strong> · {fmtUsd(payload.account_size)} account</>;
      break;
    case "payout":
      line = <>{shortAddr(payload.trader)} received <strong>{fmtUsd(payload.trader_share_usdc)}</strong> {payload.gross_profit_usdc ? <span className="opacity-70">(gross {fmtUsd(payload.gross_profit_usdc)})</span> : null}</>;
      break;
    case "governance":
      line = <>Proposal #{payload.proposal_id} — {payload.title || message.content}</>;
      break;
    case "maintenance":
    case "announcement":
    default:
      line = message.content || "(announcement)";
  }

  return (
    <div className={`py-2 px-3 my-0.5 rounded-md border ${meta.colour}`}>
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 shrink-0 rounded-md bg-muted/50 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">{meta.label}</span>
            <span className="text-[10px] text-muted-foreground/70">· {time}</span>
          </div>
          <div className="text-sm text-foreground/90 mt-0.5">{line}</div>
          {kind === "maintenance" || kind === "announcement"
            ? null
            : message.content && <div className="text-xs text-muted-foreground mt-1">{message.content}</div>}
        </div>
      </div>
    </div>
  );
}
