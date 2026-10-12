import SEO from "@/components/SEO";
import GuideReader from "@/components/GuideReader";
import { GUIDE_CATEGORIES, ALL_GUIDES } from "@/lib/guideData";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

function GuideSidebar({ slug }) {
  const [expandedCats, setExpandedCats] = useState(new Set());

  useEffect(() => {
    if (slug) {
      const cat = GUIDE_CATEGORIES.find((c) => c.guides.some((g) => g.slug === slug));
      if (cat) setExpandedCats((prev) => new Set([...prev, cat.id]));
    }
  }, [slug]);

  const toggleCat = (catId) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start gap-5 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-1">
      <nav className="space-y-0.5">
        <Link
          to={createPageUrl("Support")}
          className="flex items-center gap-2 px-3.5 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
        >
          ← Support Centre
        </Link>

        <div className="pt-1 pb-0.5 px-3.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How-To Guides</p>
        </div>

        {GUIDE_CATEGORIES.map((cat) => {
          const isExpanded = expandedCats.has(cat.id);
          const hasActiveGuide = cat.guides.some((g) => g.slug === slug);
          return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCat(cat.id)}
                className={`w-full flex items-center justify-between gap-1 px-3.5 py-2.5 rounded-lg text-sm text-left transition-colors ${
                  hasActiveGuide
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="truncate">{cat.icon} {cat.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="ml-3 pl-3 border-l border-border/50 space-y-0.5 my-1">
                  {cat.guides.map((guide) => (
                    <Link
                      key={guide.slug}
                      to={`/guides/${guide.slug}`}
                      className={`block px-2.5 py-2 rounded text-xs leading-snug transition-colors ${
                        slug === guide.slug
                          ? "text-primary font-medium bg-primary/5"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {guide.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground">Ready to start?</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3.5">Pick an account size and launch your challenge today.</p>
        <Link to={createPageUrl("Onboarding")}>
          <Button size="sm" className="w-full bg-primary text-primary-foreground text-xs glow-green-sm">
            Start Challenge
          </Button>
        </Link>
      </div>
    </aside>
  );
}

export default function Guide() {
  const { "*": wildcard } = useParams();
  const navigate = useNavigate();
  const slug = wildcard || null;

  const guide = slug ? ALL_GUIDES.find((g) => g.slug === slug) : null;

  const handleBack = () => navigate(createPageUrl("Support") + "?tab=guides");

  return (
    <div className="max-w-6xl mx-auto">
      <SEO
        title={guide ? `${guide.title} — How-To Guide` : "How-To Guides"}
        description={guide ? guide.description : "Step-by-step guides for ChainFunded: trading, challenges, payouts, LP deposits, and more."}
        canonical={slug ? `/guides/${slug}` : "/guides"}
      />

      <div className="flex gap-8 items-start">
        <GuideSidebar slug={slug} />
        <div className="flex-1 min-w-0 py-2">
          {slug ? (
            <GuideReader slug={slug} onBack={handleBack} />
          ) : (
            // Fallback if someone lands on /guides with no slug
            <div className="space-y-4">
              <h1 className="text-2xl font-grotesk font-bold text-foreground">How-To Guides</h1>
              <p className="text-sm text-muted-foreground">Select a guide from the sidebar to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
