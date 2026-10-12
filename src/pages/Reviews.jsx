import { useEffect, useState } from "react";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { PenLine } from "lucide-react";
import StarRating from "@/components/reviews/StarRating";
import ReviewCard from "@/components/reviews/ReviewCard";
import ReviewForm from "@/components/reviews/ReviewForm";
import ReviewsTrustBanner from "@/components/reviews/ReviewsTrustBanner";
import { fetchReviews } from "@/lib/reviews";

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "highest", label: "Highest rated" },
  { key: "payout", label: "Payout-verified" },
];

export default function Reviews() {
  const [data, setData] = useState({ reviews: [], aggregate: { count: 0, average: 0, payoutVerified: 0 } });
  const [sort, setSort] = useState("newest");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = async (s = sort, rf = ratingFilter) => {
    setLoading(true);
    try { setData(await fetchReviews({ sort: s, rating: rf || undefined })); }
    catch { /* keep prior data */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const { reviews, aggregate } = data;

  const jsonLd = aggregate.count > 0 ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ChainFunded Evaluation",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: aggregate.average,
      reviewCount: aggregate.count,
      bestRating: 5, worstRating: 1,
    },
  } : null;

  return (
    <>
      <SEO
        title="Reviews — ChainFunded"
        description="Verified reviews from real funded ChainFunded traders. Every reviewer is verified on-chain; payout-verified traders carry a gold badge. We never remove a review for being critical."
      />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <h1 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground">Trader reviews</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Every reviewer is a real funded trader, verified on-chain. We never remove a review for being critical — only abuse or spam.
            </p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            {aggregate.count > 0 && (
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="font-grotesk text-3xl font-bold text-foreground">{aggregate.average.toFixed(1)}</span>
                  <StarRating value={Math.round(aggregate.average)} size={18} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{aggregate.count} verified · {aggregate.payoutVerified} payout-verified</div>
              </div>
            )}
            <Button onClick={() => setFormOpen(true)} className="gap-2"><PenLine className="w-4 h-4" /> Write a review</Button>
          </div>
        </div>

        {/* Trust explainer — how anyone can verify these reviews */}
        <ReviewsTrustBanner />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => { setSort(s.key); load(s.key, ratingFilter); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${sort === s.key ? "bg-primary/15 border-primary/30 text-primary" : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-primary/20"}`}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground/30">·</span>
          {[0, 5, 4, 3, 2, 1].map((rf) => (
            <button
              key={rf}
              onClick={() => { setRatingFilter(rf); load(sort, rf); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${ratingFilter === rf ? "bg-primary/15 border-primary/30 text-primary" : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-primary/20"}`}
            >
              {rf === 0 ? "All ratings" : `${rf}★`}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-muted-foreground text-sm py-16 text-center">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-2xl">
            <p className="text-foreground font-semibold">No reviews yet.</p>
            <p className="text-muted-foreground text-sm mt-1">Got funded and paid? Be the first verified voice.</p>
            <Button onClick={() => setFormOpen(true)} className="gap-2 mt-5"><PenLine className="w-4 h-4" /> Write a review</Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
          </div>
        )}
      </div>

      <ReviewForm open={formOpen} onClose={() => setFormOpen(false)} onSubmitted={() => load()} />
    </>
  );
}
