import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    number: "01",
    phase: "Phase 1",
    title: "Prove your strategy.",
    description:
      "Trade a simulated account and hit the profit target while keeping losses in check. You pick the account size — the rules are the same across all tiers.",
    rules: [
      { label: "Profit target",    value: "10%" },
      { label: "Daily loss limit", value: "5%" },
      { label: "Max drawdown",     value: "10%" },
      { label: "Min trading days", value: "4" },
    ],
  },
  {
    number: "02",
    phase: "Phase 2",
    title: "Confirm it wasn't luck.",
    description:
      "A shorter phase with a lower target. Same loss rules. The idea is consistency, not another stretch run. Most traders who pass Phase 1 pass this inside two weeks.",
    rules: [
      { label: "Profit target",    value: "5%" },
      { label: "Daily loss limit", value: "5%" },
      { label: "Max drawdown",     value: "10%" },
      { label: "Min trading days", value: "4" },
    ],
  },
  {
    number: "03",
    phase: "Funded",
    title: "Get paid. Automatically.",
    description:
      "Submit your performance proof on-chain. The contract verifies it against the signed trading data. If the rules passed, USDC hits your wallet. There's no separate payout request, no waiting period.",
    rules: [
      { label: "Profit split",  value: "80% yours" },
      { label: "Payout method", value: "USDC on Ethereum" },
      { label: "Payout time",   value: "Seconds" },
      { label: "Enforced by",   value: "Smart contract" },
    ],
  },
];

export default function HowItWorks() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border bg-card/20">
      <div className="max-w-7xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-16">
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              How it works
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              Three steps.<br />No surprises.
            </h2>
          </div>
          <Link to={createPageUrl("Onboarding")}>
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10 font-grotesk"
            >
              Start a Challenge →
            </Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-0 md:gap-px bg-border/40 rounded-xl overflow-hidden">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="bg-card/50 p-8 flex flex-col gap-6"
            >
              {/* number + phase */}
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-5xl font-bold text-muted-foreground/15 select-none leading-none">
                  {step.number}
                </span>
                <span className="font-mono text-xs text-primary tracking-wider uppercase">
                  {step.phase}
                </span>
              </div>

              {/* title + description */}
              <div>
                <h3 className="font-grotesk text-xl font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* rules */}
              <div className="mt-auto space-y-2 pt-4 border-t border-border">
                {step.rules.map((rule) => (
                  <div key={rule.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{rule.label}</span>
                    <span className="font-mono text-xs text-foreground tabular-nums">
                      {rule.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
