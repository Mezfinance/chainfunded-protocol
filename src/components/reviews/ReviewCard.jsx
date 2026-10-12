import { ShieldCheck, BadgeCheck, ExternalLink } from "lucide-react";
import StarRating from "@/components/reviews/StarRating";
import VerifyPanel from "@/components/reviews/VerifyPanel";
import { formatAccountSize, formatUsd, relativeDate } from "@/lib/reviews";
import { explorerTxUrl } from "@/lib/thirdwebClient";

// Verification badge: gold for payout-verified, green for verified trader.
function VerifiedBadge({ review }) {
  if (review.verification === "payout") {
    const tx = review.payoutTxHash;
    const inner = (
      <>
        <BadgeCheck className="w-3.5 h-3.5" />
        Payout-verified
        {review.payoutTotalUsdc != null && (
          <span className="opacity-80">· {formatUsd(review.payoutTotalUsdc)} paid out</span>
        )}
        {tx && <ExternalLink className="w-3 h-3 opacity-70" />}
      </>
    );
    const cls = "inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border border-amber-400/40 bg-amber-400/10 text-amber-300";
    return tx
      ? <a href={explorerTxUrl(tx)} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-amber-400/15`} title="View the payout on Etherscan">{inner}</a>
      : <span className={cls}>{inner}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary">
      <ShieldCheck className="w-3.5 h-3.5" />
      Verified trader
      {review.accountSize != null && <span className="opacity-80">· {formatAccountSize(review.accountSize)} account</span>}
    </span>
  );
}

export default function ReviewCard({ review }) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <StarRating value={review.rating} size={16} />
        <VerifiedBadge review={review} />
      </div>

      <h3 className="font-grotesk text-base font-semibold text-foreground leading-snug">{review.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{review.body}</p>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground/70">
        <span className="font-mono truncate" title={review.traderAddress}>{review.displayName || `${(review.traderAddress || "").slice(0,6)}…`}</span>
        <span>{relativeDate(review.createdAt)}</span>
      </div>

      <VerifyPanel review={review} />
    </div>
  );
}
