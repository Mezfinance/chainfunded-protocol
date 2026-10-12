import { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { X, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReviewForm from "@/components/reviews/ReviewForm";

/**
 * ReviewPrompt — a gentle, dismissible nudge to leave a verified review, fired
 * at positive milestones (not just payouts). Mounted once in App; it listens
 * for `cf:review-prompt` { detail: { trigger } } events. Triggers are dispatched
 * from the Claim flow:
 *   - "phase_passed" — passed Phase 1 → Phase 2
 *   - "funded"       — passed Phase 2 → funded account
 *   - "payout"       — claimed a USDC payout (gold tier)
 *
 * Anti-nag: shows at most once per session, never if the wallet already
 * reviewed, and "Not now" suppresses it for a week. We never prompt on a
 * breach/fail, and /reviews stays open to everyone regardless.
 */
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

const COPY = {
  phase_passed: { emoji: "🎉", title: "Nice — you passed.", body: "Help the next trader decide: leave a verified review." },
  funded:       { emoji: "🎉", title: "You're funded.", body: "Mind sharing how it went? Verified funded traders only." },
  payout:       { emoji: "🥇", title: "Paid out.", body: "Leave a payout-verified review — it carries the gold badge." },
  default:      { emoji: "⭐", title: "Enjoying ChainFunded?", body: "Leave a verified review." },
};

export default function ReviewPrompt() {
  const account = useActiveAccount();
  const [trigger, setTrigger] = useState(null); // null = hidden
  const [formOpen, setFormOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    const onPrompt = (e) => {
      const addr = account?.address?.toLowerCase();
      if (!addr || shownRef.current) return;
      try {
        if (localStorage.getItem(`cf-reviewed-${addr}`)) return;
        if (Number(localStorage.getItem("cf-review-dismissed") || 0) > Date.now()) return;
      } catch { /* ignore */ }
      shownRef.current = true;
      setTrigger(e?.detail?.trigger || "default");
    };
    window.addEventListener("cf:review-prompt", onPrompt);
    return () => window.removeEventListener("cf:review-prompt", onPrompt);
  }, [account]);

  if (!trigger) return null;
  const c = COPY[trigger] || COPY.default;

  const dismiss = () => {
    try { localStorage.setItem("cf-review-dismissed", String(Date.now() + DISMISS_MS)); } catch { /* ignore */ }
    setTrigger(null);
  };
  const onSubmitted = () => {
    try { if (account?.address) localStorage.setItem(`cf-reviewed-${account.address.toLowerCase()}`, "1"); } catch { /* ignore */ }
    setFormOpen(false);
    setTrigger(null);
  };

  return (
    <>
      {!formOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md">
          <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <span className="text-2xl leading-none mt-0.5">{c.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-grotesk font-semibold text-foreground text-sm">{c.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.body}</p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5"><PenLine className="w-3.5 h-3.5" /> Leave a review</Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
              </div>
            </div>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      <ReviewForm open={formOpen} onClose={() => setFormOpen(false)} onSubmitted={onSubmitted} />
    </>
  );
}
