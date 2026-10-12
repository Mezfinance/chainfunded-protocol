import { ExternalLink, FileCode2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const CONTRACT_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const ETHERSCAN_URL = CONTRACT_ADDRESS
  ? `https://etherscan.io/address/${CONTRACT_ADDRESS}`
  : "https://etherscan.io";

const POINTS = [
  {
    number: "01",
    title: "Payouts execute automatically.",
    body: "You submit proof of your performance — signed by the trading engine, verified by the contract. If the rules pass, USDC transfers to your wallet. Takes seconds. Nobody approves it, nobody can block it.",
  },
  {
    number: "02",
    title: "The rules are in the contract.",
    body: "Phase targets, loss limits, minimum trading days — they're written into the challenge when you register, not decided later. Read them on Etherscan before you pay a cent. They can't be changed after the fact.",
  },
  {
    number: "03",
    title: "We can't hold your payout.",
    body: "Trader payouts come from the LP pool held inside the smart contract — not a corporate bank account. There's no discretion clause. If you earned it and the rules passed, the contract pays it.",
  },
];

export default function WhyOnChain() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border">
      <div className="max-w-7xl mx-auto">

        <div className="grid lg:grid-cols-[340px_1fr] gap-12 lg:gap-20">
          {/* left — heading */}
          <div className="lg:pt-1">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              Why on-chain
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              One difference<br />that actually<br />matters.
            </h2>
            <p className="mt-5 text-muted-foreground text-sm leading-relaxed">
              Every other prop firm makes a promise.
              ChainFunded makes a contract.
            </p>
          </div>

          {/* right — points */}
          <div className="space-y-10">
            {POINTS.map((p) => (
              <div key={p.number} className="grid grid-cols-[48px_1fr] gap-4">
                <span className="font-mono text-xs text-muted-foreground/40 pt-1 select-none">
                  {p.number}
                </span>
                <div>
                  <h3 className="font-grotesk text-lg font-semibold text-foreground mb-2">
                    {p.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            ))}

            {/* read the contract + raw address */}
            <div className="grid grid-cols-[48px_1fr] gap-4">
              <span className="font-mono text-xs text-muted-foreground/40 pt-1 select-none">—</span>
              <div className="space-y-3">
                <Link
                  to={createPageUrl("ContractExplorer")}
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline underline-offset-4"
                >
                  <FileCode2 className="w-4 h-4" />
                  Read the contract
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The full source, plus an assistant that answers from the code itself — including exactly what we can and can't do.
                </p>
                <a
                  href={ETHERSCAN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-primary transition-colors break-all"
                >
                  {CONTRACT_ADDRESS || "Contract address loading…"}
                  <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
