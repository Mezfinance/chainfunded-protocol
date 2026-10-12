import { useState } from "react";
import { ShieldCheck, ExternalLink, Loader2, Check, X, ChevronDown } from "lucide-react";
import { formatAccountSize, verifyReviewSignature } from "@/lib/reviews";
import { verifyReviewOnChain } from "@/lib/reviewChain";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/thirdwebClient";

// One row in the verification checklist. state: pass | fail | pending | skip
function Row({ state, children, href }) {
  const icon = state === "pending"
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
    : state === "pass"
      ? <Check className="w-3.5 h-3.5 text-primary shrink-0" />
      : state === "fail"
        ? <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
        : <span className="w-3.5 h-3.5 shrink-0" />;
  const tone = state === "fail" ? "text-red-400" : state === "pass" ? "text-foreground" : "text-muted-foreground";
  const body = <span className={`text-[11px] ${tone}`}>{children}</span>;
  return (
    <div className="flex items-center gap-2">
      {icon}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">{body}<ExternalLink className="w-2.5 h-2.5 opacity-60" /></a> : body}
    </div>
  );
}

/**
 * VerifyPanel — a self-contained, trustless verifier for a single review.
 * Recovers the wallet signature in the browser and reads the ChainFunded
 * contract directly (getChallenge / settledPayouts) so anyone can confirm the
 * reviewer is a real on-chain trader. Used on review cards and the landing
 * ticker. Legacy reviews without nonce/issued skip the signature row instead of
 * falsely showing red.
 */
export default function VerifyPanel({ review, align = "start", onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [sig, setSig] = useState(null);
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(false);

  const canCheckSig = !!(review.signature && review.nonce && review.issued);
  const isPayout = review.verification === "payout";

  const run = async () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
    if (!next || sig || chain) return; // already run, just toggling
    if (canCheckSig) setSig(verifyReviewSignature(review));
    setBusy(true);
    try { setChain(await verifyReviewOnChain(review)); }
    catch { setChain({ error: "On-chain read failed" }); }
    setBusy(false);
  };

  const allGood = (!canCheckSig || sig?.ok) && chain && chain.challengeOk && (!isPayout || chain.payoutOk);

  return (
    <div className={align === "center" ? "flex flex-col items-center" : ""}>
      <button
        onClick={run}
        className={`inline-flex items-center gap-1 text-[11px] transition-colors ${open && allGood ? "text-primary" : "text-primary/70 hover:text-primary"}`}
        title="Re-verify this review yourself — signature + on-chain"
      >
        {open && busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
        {open ? "Verification" : "Verify"}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-background/40 p-3 space-y-1.5 text-left w-full max-w-md">
          {/* 1. Signature (skipped for legacy reviews missing the signed fields) */}
          {canCheckSig ? (
            <>
              <Row state={!sig ? "pending" : sig.signatureOk ? "pass" : "fail"} href={sig?.signer ? explorerAddressUrl(sig.signer) : undefined}>
                {!sig ? "Checking signature…"
                  : sig.signatureOk ? `Wallet-signed by ${sig.signer.slice(0, 6)}…${sig.signer.slice(-4)}`
                  : "Signature does not match"}
              </Row>
              {sig && review.contentHash && !sig.hashOk && (
                <Row state="fail">Content hash mismatch — text may be altered</Row>
              )}
            </>
          ) : (
            <Row state="skip">Signed by the reviewer&apos;s wallet</Row>
          )}

          {/* 2. Challenge registered on-chain */}
          <Row state={busy && !chain ? "pending" : chain?.challengeOk ? "pass" : chain ? "fail" : "pending"}>
            {!chain ? "Reading the contract…"
              : chain.challengeOk
                ? `Challenge registered on-chain${chain.accountSizeUsdc ? ` · ${formatAccountSize(Number(chain.accountSizeUsdc) / 1e6)}` : ""}`
                : chain.supported ? "Could not confirm challenge on-chain" : "On-chain check unavailable"}
          </Row>

          {/* 3. Payout settled on-chain (gold tier only) */}
          {isPayout && (
            <Row
              state={busy && !chain ? "pending" : chain?.payoutOk ? "pass" : chain ? "fail" : "pending"}
              href={review.payoutTxHash ? explorerTxUrl(review.payoutTxHash) : undefined}
            >
              {!chain ? "Reading the contract…"
                : chain.payoutOk ? "Payout settled on-chain"
                : "Could not confirm payout on-chain"}
            </Row>
          )}
        </div>
      )}
    </div>
  );
}
