import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BadgeCheck, Wallet, ShieldCheck, BookOpen, ArrowRight } from "lucide-react";

const GUIDES_URL = `${createPageUrl("Support")}?tab=guides`;

const STEPS = [
  {
    n: "01",
    icon: BadgeCheck,
    title: "Prove it",
    body: "Pay a one-time evaluation fee and trade a challenge account. Hit the profit target without breaking the risk limits — that's the whole test.",
  },
  {
    n: "02",
    icon: Wallet,
    title: "Get funded",
    body: "Pass, and you trade the firm's capital — up to $200,000 — not your own. The entry fee is the only money you ever put at risk.",
  },
  {
    n: "03",
    icon: ShieldCheck,
    title: "Get paid",
    body: "Profit on the funded account is yours to withdraw — you keep 80%. No subscription, no targets to keep hitting forever.",
  },
];

// A beginner primer on the funded-trading model. Sits after the social proof so
// the category-aware scroll past, while crypto-native / first-time visitors get
// the premise — and it captures the "what is a prop firm" search intent.
export default function WhatIsFundedTrading() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border">
      <div className="max-w-5xl mx-auto text-center">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
          What is funded trading?
        </p>
        <h2 className="font-grotesk text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
          Get funded to trade.<br className="hidden sm:block" /> Risk only the fee.
        </h2>
        <p className="mt-6 text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          A prop (&ldquo;proprietary&rdquo;) firm backs skilled traders with the firm&apos;s
          own capital. You prove your skill in a paid evaluation, then trade the
          firm&apos;s money and keep most of the profit — never risking more than the fee.
        </p>
      </div>

      {/* The three steps */}
      <div className="max-w-6xl mx-auto mt-14 grid md:grid-cols-3 gap-5">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.n} className="rounded-2xl border border-border bg-card/50 p-7">
              <div className="flex items-center justify-between mb-5">
                <span className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </span>
                <span className="font-mono text-xs text-muted-foreground/40 select-none">{s.n}</span>
              </div>
              <h3 className="font-grotesk text-xl font-semibold text-foreground mb-2">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
            </div>
          );
        })}
      </div>

      {/* Differentiator + beginner CTA */}
      <div className="max-w-3xl mx-auto mt-12 text-center">
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
          The catch with legacy prop firms: they&apos;re off-chain — they can stall
          payouts, move the goalposts, or simply refuse to pay.{" "}
          <span className="text-foreground font-medium">ChainFunded enforces every rule and payout in a smart contract</span>{" "}
          — so it can&apos;t choose not to pay you.
        </p>
        <Link
          to={GUIDES_URL}
          className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline underline-offset-4"
        >
          <BookOpen className="w-4 h-4" />
          New to this? Start with the How-To Guides
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
