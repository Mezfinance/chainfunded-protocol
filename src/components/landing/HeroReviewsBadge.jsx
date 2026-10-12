import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { createPageUrl } from "@/utils";
import { fetchReviews } from "@/lib/reviews";

const STAR = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

function Stars({ value }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (cls) => (
    <span className={`inline-flex gap-0.5 ${cls}`}>
      {[...Array(5)].map((_, i) => (
        <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d={STAR} /></svg>
      ))}
    </span>
  );
  return (
    <span className="relative inline-flex">
      {row("text-muted-foreground/25")}
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>{row("text-primary")}</span>
    </span>
  );
}

// Pseudo-Trustpilot social-proof widget for the hero: average stars + the count
// of verified-on-chain reviews, linking to /reviews. Hides until there's data.
export default function HeroReviewsBadge() {
  const [agg, setAgg] = useState(null);

  useEffect(() => {
    let alive = true;
    // featured:true is cheap and still returns the global published aggregate.
    fetchReviews({ featured: true })
      .then((d) => { if (alive) setAgg(d?.aggregate || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!agg || !agg.count) return null;

  return (
    <Link
      to={createPageUrl("Reviews")}
      className="group inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 backdrop-blur-sm pl-3 pr-4 py-1.5 mb-6 hover:border-primary/40 transition-colors"
    >
      <Stars value={agg.average} />
      <span className="font-grotesk font-bold text-foreground text-sm">{agg.average.toFixed(1)}</span>
      <span className="w-px h-3.5 bg-border" />
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        {agg.count} verified on-chain review{agg.count === 1 ? "" : "s"}
      </span>
    </Link>
  );
}
