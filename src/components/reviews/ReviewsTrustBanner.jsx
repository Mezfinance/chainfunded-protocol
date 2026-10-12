import { ShieldCheck, Fingerprint, Boxes, BadgeCheck } from "lucide-react";

// Explainer shown at the top of the reviews page so visitors instantly grasp
// that these reviews are not self-attested marketing — they're cryptographically
// + on-chain verifiable, and anyone can check each one in their own browser.
const POINTS = [
  { icon: Fingerprint, title: "Wallet-signed", body: "Each review is signed by the trader's wallet. The text can't be edited without breaking the signature." },
  { icon: Boxes, title: "Challenge on-chain", body: "We read the contract to confirm the reviewer registered a real, paid challenge on Ethereum." },
  { icon: BadgeCheck, title: "Payout on-chain", body: "Gold “Payout-verified” reviews have a settled payout recorded on-chain — with the tx to prove it." },
];

export default function ReviewsTrustBanner() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-5 sm:p-6 mb-8">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-grotesk text-lg font-bold text-foreground">Don&apos;t trust — verify.</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every review here is provably from a real ChainFunded trader. Hit{" "}
            <span className="inline-flex items-center gap-1 text-primary font-medium"><ShieldCheck className="w-3.5 h-3.5" />Verify</span>{" "}
            on any review to check it yourself — right in your browser, no trust in us required.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-5">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
