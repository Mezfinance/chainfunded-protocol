import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

const HOW = [
  {
    step: "01",
    title: "Deposit USDC.",
    body: "Add liquidity to the pool and receive CFND tokens representing your share. CFND starts at $1.00 NAV and tracks the pool's capital value.",
  },
  {
    step: "02",
    title: "Back trader payouts.",
    body: "Your capital funds real payouts to traders who pass the challenge. A portion of every challenge fee flows back into the LP profit pool — claimable any time.",
  },
  {
    step: "03",
    title: "Withdraw when you want.",
    body: "Redeem CFND for USDC at current NAV. Withdrawals are subject to pool liquidity — if the pool is depleted, redemptions are pro-rated.",
  },
];

export default function LPSection() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border">
      <div className="max-w-7xl mx-auto">

        <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-20 items-start">

          {/* left */}
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              Liquidity providers
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-6">
              Fund the pool.<br />Earn from every challenge.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xl mb-10">
              The LP pool is the counterparty to every trader payout. Liquidity providers
              deposit USDC, receive CFND pool tokens, and earn yield from the share of
              challenge fees that flows back to the pool. No lock-up — deposit and withdraw
              on your terms.
            </p>

            <div className="space-y-8">
              {HOW.map((item) => (
                <div key={item.step} className="grid grid-cols-[40px_1fr] gap-4">
                  <span className="font-mono text-xs text-muted-foreground/40 pt-0.5 select-none">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="font-grotesk text-base font-semibold text-foreground mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <Link to={createPageUrl("LPDashboard")}>
                <Button
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/10 font-grotesk"
                >
                  View the LP Pool →
                </Button>
              </Link>
            </div>
          </div>

          {/* right — risk/yield card */}
          <div className="space-y-4 lg:pt-16">
            <div className="rounded-xl border border-border bg-card/50 p-6 space-y-5">

              <div>
                <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-2">
                  How yield accrues
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Challenge fee share",    value: "6% of each fee" },
                    { label: "Payout residual",        value: "Firm cut LP share" },
                    { label: "LP token",               value: "CFND (redeemable)" },
                    { label: "Starting NAV",           value: "$1.00 per CFND" },
                    { label: "Lock-up",                value: "None" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="font-mono text-xs text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-4">
                <p className="text-xs text-yellow-400/80 leading-relaxed">
                  <span className="font-semibold">Risk note:</span> LP capital backs real trader
                  payouts. If payouts exceed fees earned, NAV can fall below $1.00.
                  Only deposit what you can afford to lose.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
