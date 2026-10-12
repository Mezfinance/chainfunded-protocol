import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

const EARN_WAYS = [
  {
    tag: "Traders",
    title: "Complete challenges, earn CFG.",
    body: "Every season allocates a CFG budget to the trader pool. The more challenges you complete, the larger your share of that budget.",
    registration: {
      heading: "Registration required.",
      detail:
        "Buying a challenge doesn't automatically enrol you for season points. After purchasing, you need to register each account on the CFG Rewards page — one on-chain transaction per account. Unregistered accounts earn nothing. There's a Register All shortcut if you have multiple accounts.",
    },
    cta: { label: "Go to CFG Rewards →", page: "CfgRewards" },
  },
  {
    tag: "LPs",
    title: "Stake CFND, earn CFG.",
    body: "A separate CFG budget goes to LPs each season, emitted continuously to stakers. You also keep earning USDC from the LP profit pool while staked.",
    registration: {
      heading: "Holding CFND isn't enough.",
      detail:
        "You need to stake your CFND tokens on the CFG Rewards page to earn CFG. Unstaked CFND still earns USDC yield from the pool, but you miss the CFG emission entirely. Staking and unstaking are instant — there's no lock-up period.",
    },
    cta: { label: "View LP Pool →", page: "LPDashboard" },
  },
];

export default function RewardsSeasons() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border bg-card/20">
      <div className="max-w-7xl mx-auto">

        <div className="grid lg:grid-cols-[320px_1fr] gap-12 lg:gap-20 items-start">

          {/* left */}
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              CFG Rewards
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-5">
              Seasons.<br />Governance.<br />Ownership.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              CFG is the ChainFunded governance token. Each season is a fixed
              time window with a predetermined CFG budget, split between active
              traders and liquidity providers.
            </p>

            <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3 mb-8">
              {[
                { label: "Season structure",  value: "Fixed time window" },
                { label: "Trader pool",       value: "Challenge completions" },
                { label: "LP pool",           value: "CFND staking" },
                { label: "Token",             value: "CFG (governance)" },
                { label: "Budget visibility", value: "Set on-chain before start" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-mono text-xs text-foreground">{value}</span>
                </div>
              ))}
            </div>

            <Link to={createPageUrl("CfgRewards")}>
              <Button
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 font-grotesk"
              >
                View CFG Rewards →
              </Button>
            </Link>
          </div>

          {/* right — earn cards */}
          <div className="space-y-5">
            {EARN_WAYS.map((way) => (
              <div
                key={way.tag}
                className="rounded-xl border border-border bg-card/50 overflow-hidden"
              >
                <div className="p-6 pb-5">
                  <span className="inline-block font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/30 bg-primary/10 rounded px-2 py-0.5 mb-4">
                    {way.tag}
                  </span>
                  <h3 className="font-grotesk text-lg font-semibold text-foreground mb-2">
                    {way.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {way.body}
                  </p>
                </div>

                {/* registration callout */}
                <div className="mx-6 mb-5 rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <p className="text-xs font-semibold text-foreground mb-1">
                    {way.registration.heading}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {way.registration.detail}
                  </p>
                </div>

                <div className="px-6 pb-6">
                  <Link to={createPageUrl(way.cta.page)}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border text-muted-foreground hover:text-foreground font-grotesk"
                    >
                      {way.cta.label}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-card/50 p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">Between seasons?</span>{" "}
                CFG balances carry over. Season budgets are published on-chain before
                each season opens — you can see exactly how much CFG is up for
                distribution before committing.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
