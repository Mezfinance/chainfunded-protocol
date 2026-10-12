import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FAQS = [
  {
    q: "Is any real money at risk?",
    a: "The only real money you pay is the evaluation fee — a one-time USDC amount when you register. All trading is done with simulated capital; no real funds are ever put into market positions. Payouts are real USDC funded from the LP pool.",
  },
  {
    q: "What happens if I break a rule?",
    a: "Breaching the 5% daily loss or 10% total drawdown limit ends your challenge. You can start a new one, but the original fee is non-refundable once paid on-chain — just like any smart contract transaction.",
  },
  {
    q: "Can ChainFunded decide not to pay me?",
    a: "No. Payouts are executed by the smart contract, not by us. If you submit valid proof and all rules pass, the contract transfers USDC to your wallet automatically. There is no human approval step and no 'at our discretion' clause.",
  },
  {
    q: "How quickly do payouts arrive?",
    a: "Once you submit the payout transaction, it settles in a single Ethereum block — typically a few seconds. You'll see the USDC in your wallet almost immediately after the transaction confirms.",
  },
  {
    q: "What wallets are supported?",
    a: "Any Ethereum-compatible wallet works — MetaMask, Coinbase Wallet, Rainbow, and most hardware wallets. We also support in-app wallets for traders who prefer not to manage their own keys.",
  },
  {
    q: "What assets can I trade?",
    a: "Forex pairs and major indices are available through the simulated trading terminal. Specific tradable pairs are listed in the platform once you connect a wallet.",
  },
  {
    q: "Can I run multiple challenges at once?",
    a: "Yes. You can register multiple challenges across different account sizes, subject to available protocol TVL. Each challenge is a separate on-chain account with independent tracking.",
  },
  {
    q: "Is the smart contract audited?",
    a: "The contract is publicly verifiable on Etherscan. A formal audit is in progress — we'll publish the full report when complete. In the meantime, the source code is available for anyone to read.",
  },
];

export default function LandingFAQ() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border bg-card/20">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[320px_1fr] gap-12 lg:gap-20">

          <div className="lg:pt-1">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              FAQ
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              Questions<br />worth asking.
            </h2>
            <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
              Anything else?{" "}
              <Link
                to={createPageUrl("Support")}
                className="text-primary hover:underline underline-offset-4"
              >
                Talk to support →
              </Link>
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-0">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border-b border-border"
              >
                <AccordionTrigger className="font-grotesk text-left text-base font-medium text-foreground hover:text-primary hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

        </div>
      </div>
    </section>
  );
}
