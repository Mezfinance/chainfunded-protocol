/**
 * PayoutReceipt — the live "settling → executed" payout card. Loops a 12s
 * one-block countdown with the brand bolt charging green, then holds the
 * executed state. Shared by the /Funded campaign page and the /Onboarding
 * warm-up so the ad creative ("payouts in seconds") is message-matched on the
 * page the campaign actually lands on. Illustrative figures; "Verify real
 * payouts on-chain" links to the live contract explorer.
 */
import { useState, useEffect, useId } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle2, ArrowRight } from "lucide-react";

const PTS = "278 42 64 298 256 298 234 470 448 214 256 214 278 42";

// Brand lightning bolt that charges green from the bottom up (smooth SMIL fill),
// in sync with the 16s receipt cycle (12s charge + ~4s hold).
function BoltFill({ className = "w-9 h-9" }) {
  const clipId = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}><polygon points={PTS} /></clipPath>
      </defs>
      <polygon points={PTS} className="fill-primary/15" />
      <rect x="0" width="512" className="fill-primary" clipPath={`url(#${clipId})`}>
        <animate attributeName="y" dur="16s" repeatCount="indefinite" values="512;0;0" keyTimes="0;0.75;1" />
        <animate attributeName="height" dur="16s" repeatCount="indefinite" values="0;512;512" keyTimes="0;0.75;1" />
      </rect>
      <polygon points={PTS} fill="none" className="stroke-primary" strokeWidth="20" strokeLinejoin="round" />
    </svg>
  );
}

export default function PayoutReceipt() {
  const COUNT_FROM = 12;   // seconds — one Ethereum block
  const CYCLE = 16;        // 12s counting + ~4s holding the executed state
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % CYCLE), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = COUNT_FROM - tick;
  const done = remaining <= 0;
  const ss = String(Math.max(0, remaining)).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur-sm p-6 sm:p-8 glow-green-sm">
      <div className="flex items-center justify-between mb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Trader payout</span>
        {done ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <CheckCircle2 className="w-3 h-3" /> Executed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Settling
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 mb-1">
        <span className="font-mono text-6xl sm:text-7xl font-bold tabular-nums leading-none">00:{ss}</span>
        <BoltFill className="w-10 h-10 mb-2" />
      </div>
      <p className={`font-mono text-xs mb-6 ${done ? "text-primary" : "text-muted-foreground"}`}>
        {done ? "Settled in 1 block · ~12 seconds" : "Settling on-chain · 1 block"}
      </p>

      <div className="space-y-2.5 border-t border-border/60 pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Amount</span>
          <span className={`font-mono text-lg font-semibold tabular-nums transition-colors duration-300 ${done ? "text-primary" : "text-muted-foreground/40"}`}>
            +4,820.00 USDC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">To wallet</span>
          <span className="font-mono text-xs text-foreground/80">0x7a3F…9c21</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Settled by</span>
          <span className="font-mono text-xs text-foreground/80">ChainFundedPool</span>
        </div>
      </div>

      <Link
        to={createPageUrl("ContractExplorer")}
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-4"
      >
        Verify real payouts on-chain <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
