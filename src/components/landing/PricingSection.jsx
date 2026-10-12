import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { CHALLENGE_TIERS } from "@/data/challengeTiers";

export default function PricingSection() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border">
      <div className="max-w-7xl mx-auto">

        <div className="mb-12">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
            Account tiers
          </p>
          <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight">
            One fee. No monthly charges.
          </h2>
          <p className="mt-4 text-muted-foreground text-sm max-w-xl leading-relaxed">
            Pay once to enter the evaluation. If you pass, you keep 80% of your profits.
            The fee is the only real money that changes hands until you earn a payout.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card/50">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider">Account size</th>
                <th className="text-left px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider">Evaluation fee</th>
                <th className="text-left px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider">Profit split</th>
                <th className="text-left px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider">Phase 1 target</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {CHALLENGE_TIERS.map((tier, i) => (
                <tr
                  key={tier.size}
                  className={`border-b border-border last:border-0 transition-colors hover:bg-primary/5 ${
                    tier.popular ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-grotesk text-base font-semibold text-foreground tabular-nums">
                        {tier.label}
                      </span>
                      {tier.popular && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-primary/15 text-primary border border-primary/25 rounded px-1.5 py-0.5">
                          Popular
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-medium text-foreground tabular-nums">
                        {tier.fee} USDC
                      </span>
                      {tier.launchSale && tier.originalFee && (
                        <span className="font-mono text-xs text-muted-foreground/50 line-through tabular-nums">
                          {tier.originalFee}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-primary">80% yours</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-foreground tabular-nums">
                      ${(tier.size * 0.10).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={createPageUrl("Onboarding")}>
                      <Button
                        size="sm"
                        variant={tier.popular ? "default" : "outline"}
                        className={
                          tier.popular
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 font-grotesk"
                            : "border-border text-muted-foreground hover:text-foreground font-grotesk"
                        }
                      >
                        Start →
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {CHALLENGE_TIERS.map((tier) => (
            <div
              key={tier.size}
              className={`rounded-xl border p-5 ${
                tier.popular ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-grotesk text-lg font-bold text-foreground">
                    {tier.label}
                  </span>
                  {tier.popular && (
                    <span className="text-[10px] font-mono uppercase tracking-wider bg-primary/15 text-primary border border-primary/25 rounded px-1.5 py-0.5">
                      Popular
                    </span>
                  )}
                </div>
                <Link to={createPageUrl("Onboarding")}>
                  <Button
                    size="sm"
                    variant={tier.popular ? "default" : "outline"}
                    className={tier.popular ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-border"}
                  >
                    Start →
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {tier.fee} USDC
                  </p>
                  <p className="text-[11px] text-muted-foreground">fee</p>
                </div>
                <div>
                  <p className="font-mono text-sm text-primary">80%</p>
                  <p className="text-[11px] text-muted-foreground">your split</p>
                </div>
                <div>
                  <p className="font-mono text-sm text-foreground tabular-nums">
                    ${(tier.size * 0.10).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Ph.1 target</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60 font-mono">
          * Some tiers unlock as protocol TVL grows. Phase 1 target shown is 10% of account size.
        </p>

      </div>
    </section>
  );
}
