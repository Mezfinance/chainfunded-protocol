import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ShieldCheck, BadgeCheck, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import VerifyPanel from "@/components/reviews/VerifyPanel";
import { fetchReviews, formatAccountSize, formatUsd, relativeDate } from "@/lib/reviews";

// Real, verified reviews. Featured ones (curated in Admin → Reviews) lead; if
// none are featured yet we fall back to the highest-rated published reviews so
// the section is never empty-but-shown. With zero reviews it hides entirely.
const SLIDE_PX = 28;

export default function ReviewTicker() {
  const [reviews, setReviews] = useState([]);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  // slide state: x = translateX px, o = opacity, t = transition on/off
  const [slide, setSlide] = useState({ x: 0, o: 1, t: true });
  // auto-advance pauses while hovering or while a Verify panel is open
  const [hovering, setHovering] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const animatingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let { reviews: list } = await fetchReviews({ featured: true });
        if (alive && (!list || !list.length)) {
          ({ reviews: list } = await fetchReviews({ sort: "highest" }));
        }
        if (alive) setReviews((list || []).slice(0, 8));
      } catch { /* leave empty → section hides */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // Direction-aware slide: current slides out, next slides in from the far side.
  const go = useCallback((next, dir) => {
    if (animatingRef.current || next === idx) return;
    setVerifyOpen(false); // the panel remounts (key=id) and closes on a slide
    animatingRef.current = true;
    setSlide({ x: -dir * SLIDE_PX, o: 0, t: true });   // slide current out
    setTimeout(() => {
      setIdx(next);
      setSlide({ x: dir * SLIDE_PX, o: 0, t: false });  // jump to entry side (no transition)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setSlide({ x: 0, o: 1, t: true });              // settle to centre
        setTimeout(() => { animatingRef.current = false; }, 240);
      }));
    }, 240);
  }, [idx]);

  const len = reviews.length;
  const next = useCallback(() => go((idx + 1) % len, 1), [go, idx, len]);
  const prev = () => go((idx - 1 + len) % len, -1);

  useEffect(() => {
    if (len < 2 || hovering || verifyOpen) return; // pause on hover / while verifying
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [next, len, hovering, verifyOpen]);

  // Nothing to show yet, or genuinely no reviews → render nothing (no placeholder).
  if (!ready || len === 0) return null;

  const safeIdx = Math.min(idx, len - 1);
  const r = reviews[safeIdx];
  const isPayout = r.verification === "payout";
  const meta = isPayout
    ? `Payout-verified · ${formatUsd(r.payoutTotalUsdc || 0)} paid out`
    : `${formatAccountSize(r.accountSize || 0)} account`;

  return (
    <section className="border-t border-border bg-card/30 px-6 sm:px-10 lg:px-16 py-16 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Verified Trader Reviews
          </p>
          <div className="flex items-center gap-1">
            {reviews.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i, i > safeIdx ? 1 : -1)}
                aria-label={`Review ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === safeIdx ? "bg-primary w-4" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>

        {/* compact trust line — every review is verifiable, right here */}
        <p className="flex items-center gap-2 text-sm text-muted-foreground mb-8 -mt-4">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span>
            Every review is wallet-signed and verified on-chain.{" "}
            <span className="text-foreground">Hit Verify to check any of them yourself.</span>
          </span>
        </p>

        <div
          className="grid lg:grid-cols-[1fr_auto] gap-8 items-end"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div
            style={{
              transform: `translateX(${slide.x}px)`,
              opacity: slide.o,
              transition: slide.t ? "transform 240ms ease, opacity 240ms ease" : "none",
            }}
          >
            {/* stars — reflect the real rating */}
            <div className="flex gap-0.5 mb-5">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className={`w-4 h-4 ${i < r.rating ? "fill-primary text-primary" : "fill-muted-foreground/20 text-muted-foreground/20"}`} viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>

            {r.title && (
              <p className="font-grotesk font-semibold text-foreground text-lg mb-2">{r.title}</p>
            )}
            <blockquote className="text-xl sm:text-2xl font-grotesk text-foreground leading-relaxed max-w-3xl mb-6">
              "{r.body}"
            </blockquote>

            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <p className="font-mono text-sm text-primary">{r.displayName || `${(r.traderAddress || "").slice(0, 6)}…`}</p>
                <p className="text-xs text-muted-foreground">{meta} · {relativeDate(r.createdAt)}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border ${isPayout ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-primary/30 bg-primary/10 text-primary"}`}>
                {isPayout ? <BadgeCheck className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {isPayout ? "Payout-verified" : "Verified trader"}
              </span>
            </div>

            {/* trustless verification, right on the landing page */}
            <div className="mt-4">
              <VerifyPanel key={r.id} review={r} onOpenChange={setVerifyOpen} />
            </div>
          </div>

          <div className="flex gap-2 lg:flex-col">
            <button
              onClick={prev}
              disabled={len < 2}
              className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={next}
              disabled={len < 2}
              className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-8">
          <Link to={createPageUrl("Reviews")} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2.5 transition-all">
            Read all reviews <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
