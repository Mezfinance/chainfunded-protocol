import { useState } from "react";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { X, Loader2, Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/reviews/StarRating";
import { signAndSubmitReview, REVIEW_MAX_TITLE, REVIEW_MAX_BODY } from "@/lib/reviews";
import { thirdwebClient } from "@/lib/thirdwebClient";

export default function ReviewForm({ open, onClose, onSubmitted }) {
  const account = useActiveAccount();
  const { connect } = useConnectModal();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async () => {
    setError("");
    if (!rating) return setError("Pick a star rating.");
    if (!title.trim()) return setError("Add a short title.");
    if (!body.trim()) return setError("Write a few words.");
    setBusy(true);
    try {
      const review = await signAndSubmitReview({ account, rating, title: title.trim(), body: body.trim() });
      onSubmitted?.(review);
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not submit your review.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-grotesk text-lg font-semibold text-foreground">Leave a verified review</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {!account ? (
          <div className="p-6 text-center space-y-4">
            <ShieldCheck className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Connect the wallet you trade with — only funded traders can review, and we verify it on-chain.
            </p>
            <Button onClick={() => connect({ client: thirdwebClient })} className="gap-2">
              <Wallet className="w-4 h-4" /> Connect wallet
            </Button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your rating</label>
              <div className="mt-2"><StarRating value={rating} onChange={setRating} size={28} /></div>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, REVIEW_MAX_TITLE))}
              placeholder="Sum it up in a line"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            />
            <div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, REVIEW_MAX_BODY))}
                rows={4}
                placeholder="How was the evaluation? The payout? Be honest."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors resize-none"
              />
              <div className="text-right text-[11px] text-muted-foreground/60">{body.length}/{REVIEW_MAX_BODY}</div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <p className="text-[11px] text-muted-foreground/70">
              You&apos;ll sign your review with your wallet — no gas, no transaction. Your funded status is verified on-chain.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy} className="gap-2 min-w-[128px]">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing…</> : "Sign & post"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
