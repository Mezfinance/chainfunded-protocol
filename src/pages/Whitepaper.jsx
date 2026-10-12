import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText, Compass, Layers, Coins, ShieldAlert, BookText,
  Download, ChevronRight, ChevronDown,
} from "lucide-react";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";

// ── Section content (markdown) ───────────────────────────────────────────────
// Eagerly load every section file so the sidebar can render labels without
// waiting for an async import on first paint. Order is fixed by filename
// prefix (01-cover.md, 02-abstract.md, …).
const SECTION_MODULES = import.meta.glob(
  "/docs/whitepaper/sections/*.md",
  { query: "?raw", import: "default", eager: true },
);

// ── Diagrams (svg) — loaded as URLs so markdown ![alt](file.svg) resolves ───
const DIAGRAM_MODULES = import.meta.glob(
  "/docs/whitepaper/diagrams/svg/*.svg",
  { query: "?url", import: "default", eager: true },
);

// Map "filename.svg" → resolved URL. Used to rewrite ![alt](file.svg) refs
// in markdown body so the src attribute points at the Vite-bundled asset.
const DIAGRAM_BY_FILENAME = Object.fromEntries(
  Object.entries(DIAGRAM_MODULES).map(([path, url]) => [
    path.split("/").pop(),
    url,
  ]),
);

// ── Section catalogue ───────────────────────────────────────────────────────
// `slug` is the URL anchor (#cover, #abstract, …) and the IntersectionObserver
// target. `file` is the markdown filename. `label` is the short nav label
// (the H1 inside the markdown is the in-page heading).
const SECTIONS = [
  {
    id: "frontmatter", label: "Frontmatter", icon: FileText,
    items: [
      { slug: "cover",    label: "Cover",    file: "01-cover.md" },
      { slug: "abstract", label: "Abstract", file: "02-abstract.md" },
    ],
  },
  {
    id: "background", label: "Background", icon: Compass,
    items: [
      { slug: "the-problem", label: "The problem", file: "03-the-problem.md" },
      { slug: "the-thesis",  label: "The thesis",  file: "04-the-thesis.md" },
    ],
  },
  {
    id: "protocol", label: "Protocol", icon: Layers,
    items: [
      { slug: "architecture",        label: "Architecture",            file: "05-architecture.md" },
      { slug: "trader-lifecycle",    label: "Trader lifecycle",        file: "06-trader-lifecycle.md" },
      { slug: "phase-progression",   label: "Phase progression",       file: "07-phase-progression.md" },
      { slug: "lp-mechanics",        label: "LP mechanics",            file: "08-lp-mechanics.md" },
      { slug: "nav-mechanics",       label: "NAV mechanics",           file: "09-nav-mechanics.md" },
      { slug: "fee-economics",       label: "Fee economics",           file: "10-fee-economics.md" },
      { slug: "payout-enforcement",  label: "Payout enforcement",      file: "11-payout-enforcement.md" },
      { slug: "multisig-payouts",    label: "Multi-signature payouts", file: "12-multisig-payouts.md" },
      { slug: "affiliate-programme", label: "Affiliate programme",     file: "13-affiliate-programme.md" },
    ],
  },
  {
    id: "tokens", label: "Tokens & governance", icon: Coins,
    items: [
      { slug: "cfnd-token",  label: "CFND token",     file: "14-cfnd-token.md" },
      { slug: "cfg-and-dao", label: "CFG token & DAO", file: "15-cfg-and-dao.md" },
    ],
  },
  {
    id: "risk", label: "Risk & outlook", icon: ShieldAlert,
    items: [
      { slug: "risk-surface",       label: "Risk surface",        file: "16-risk-surface.md" },
      { slug: "security-posture",   label: "Security posture",    file: "17-security-posture.md" },
      { slug: "roadmap-references", label: "Roadmap + references", file: "18-roadmap-references.md" },
    ],
  },
  {
    id: "appendices", label: "Appendices", icon: BookText,
    items: [
      { slug: "appendix-a-threat-model", label: "A · Threat model",       file: "19-appendix-a-threat-model.md" },
      { slug: "appendix-b-notation",     label: "B · Notation reference", file: "20-appendix-b-notation.md" },
    ],
  },
];

const FLAT_ITEMS = SECTIONS.flatMap((g) => g.items);

// ── Markdown content getter ──────────────────────────────────────────────────
function getMarkdown(filename) {
  const key = `/docs/whitepaper/sections/${filename}`;
  return SECTION_MODULES[key] || `*Section content not found: ${filename}*`;
}

// ── Sidebar (GitHub-style, mirrors src/pages/Support.jsx) ────────────────────
function WhitepaperSidebar({ activeSlug, onJump }) {
  // Keep the group expanded that contains the active sub-item.
  const initialExpanded = useMemo(() => {
    const set = new Set();
    SECTIONS.forEach((g) => {
      if (g.items.some((it) => it.slug === activeSlug)) set.add(g.id);
    });
    if (set.size === 0) set.add("frontmatter");
    return set;
  }, [activeSlug]);

  const [expanded, setExpanded] = useState(initialExpanded);

  // Re-expand when the active item changes (e.g. user clicks a link from
  // outside the sidebar) — never auto-collapse, the user can do that.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      SECTIONS.forEach((g) => {
        if (g.items.some((it) => it.slug === activeSlug)) next.add(g.id);
      });
      return next;
    });
  }, [activeSlug]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-20 self-start gap-5 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-1">
      <div className="flex items-center gap-2 px-3.5 pt-1">
        <FileText className="w-4 h-4 text-primary" />
        <span className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
          Whitepaper · v1.0
        </span>
      </div>

      <nav className="space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon, items }) => {
          const isExpanded = expanded.has(id);
          const containsActive = items.some((it) => it.slug === activeSlug);
          return (
            <div key={id}>
              <button
                onClick={() => toggle(id)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                  containsActive
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {isExpanded && (
                <div className="mt-1 ml-2 pl-3 border-l border-border space-y-0.5 py-1">
                  {items.map((it) => {
                    const isActive = it.slug === activeSlug;
                    return (
                      <button
                        key={it.slug}
                        onClick={() => onJump(it.slug)}
                        className={`w-full flex items-center justify-between gap-1 px-2.5 py-2 rounded text-[0.8rem] text-left transition-colors ${
                          isActive
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="truncate">{it.label}</span>
                        {isActive && <ChevronRight className="w-3 h-3 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3.5 pb-2">
        <a href="/whitepaper.pdf" download="chainfunded-whitepaper.pdf">
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </Button>
        </a>
      </div>
    </aside>
  );
}

// ── Section renderer ─────────────────────────────────────────────────────────
// Renders one markdown section, with image src rewriting to resolve
// figures stored in /docs/whitepaper/diagrams/svg/ → bundled URL.
function SectionBlock({ slug, file, sectionRef }) {
  const md = getMarkdown(file);

  const components = useMemo(() => ({
    img: ({ node, src, alt, ...props }) => {
      const filename = (src || "").split("/").pop();
      const resolved = DIAGRAM_BY_FILENAME[filename];
      if (!resolved) {
        // Loud failure mode rather than the browser's default broken-img
        // icon — makes a missing diagram immediately obvious in preview.
        if (typeof console !== "undefined") {
          console.warn(`[Whitepaper] diagram not found in glob: "${filename}"`);
        }
        return (
          <figure className="my-8 rounded-xl border border-amber-500/40 bg-amber-50/50 p-4 text-amber-900">
            <div className="font-mono text-xs">
              Diagram not found: <code>{filename}</code>
            </div>
          </figure>
        );
      }
      return (
        <figure className="my-8 rounded-xl border border-border bg-card/40 p-4">
          <img src={resolved} alt={alt || ""} className="w-full h-auto rounded-md" {...props} />
          {alt && (
            <figcaption className="mt-3 text-xs text-muted-foreground font-mono text-center">
              {alt}
            </figcaption>
          )}
        </figure>
      );
    },
    h1: ({ children, ...props }) => (
      <h1 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-6" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="font-grotesk text-xl sm:text-2xl font-semibold text-foreground mt-10 mb-4" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="font-grotesk text-lg font-semibold text-foreground mt-8 mb-3" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="text-foreground/85 leading-relaxed mb-4" {...props}>
        {children}
      </p>
    ),
    code: ({ inline, children, ...props }) =>
      inline ? (
        <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[0.85em]" {...props}>
          {children}
        </code>
      ) : (
        <code className="font-mono text-sm" {...props}>
          {children}
        </code>
      ),
    pre: ({ children, ...props }) => (
      <pre className="my-5 p-4 rounded-lg bg-muted/40 border border-border overflow-x-auto text-sm" {...props}>
        {children}
      </pre>
    ),
    table: ({ children, ...props }) => (
      <div className="my-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th className="text-left px-4 py-2.5 bg-muted/30 font-semibold text-foreground text-xs uppercase tracking-wider border-b border-border" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="px-4 py-2.5 border-b border-border/40 text-foreground/85" {...props}>
        {children}
      </td>
    ),
    ul: ({ children, ...props }) => (
      <ul className="list-disc list-outside ml-5 space-y-2 mb-4 text-foreground/85" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal list-outside ml-5 space-y-2 mb-4 text-foreground/85" {...props}>
        {children}
      </ol>
    ),
    a: ({ children, href, ...props }) => (
      <a href={href} className="text-primary hover:underline underline-offset-4" target={href?.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote className="border-l-2 border-primary/40 pl-4 my-4 text-foreground/70 italic" {...props}>
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
  }), []);

  return (
    <section id={slug} ref={sectionRef} className="scroll-mt-24 max-w-3xl">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {md}
      </ReactMarkdown>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Whitepaper() {
  const [activeSlug, setActiveSlug] = useState(FLAT_ITEMS[0]?.slug);
  const sectionRefs = useRef({});

  // Smooth scroll to a section by slug, then update activeSlug for the
  // sidebar highlight.
  const jumpTo = useCallback((slug) => {
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSlug(slug);
      // Update URL hash without re-triggering the scroll.
      if (history.replaceState) history.replaceState(null, "", `#${slug}`);
    }
  }, []);

  // On mount, honour the URL hash if present.
  useEffect(() => {
    const slug = window.location.hash.replace(/^#/, "");
    if (slug && FLAT_ITEMS.some((it) => it.slug === slug)) {
      setTimeout(() => jumpTo(slug), 50);
    }
  }, [jumpTo]);

  // IntersectionObserver — mark whichever section is closest to the top of
  // the viewport as active. Threshold + rootMargin tuned so a section
  // becomes active when its title scrolls past the sticky header band.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSlug(visible[0].target.id);
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0.01 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen whitepaper-page">
      <SEO
        title="Whitepaper — ChainFunded Protocol"
        description="ChainFunded protocol whitepaper — on-chain prop-trading evaluation. Trader lifecycle, fee economics, payout enforcement, LP mechanics."
        canonical="/whitepaper"
      />

      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-10 flex gap-10 whitepaper-content">
        <WhitepaperSidebar activeSlug={activeSlug} onJump={jumpTo} />

        <main className="min-w-0 flex-1 space-y-16">
          {FLAT_ITEMS.map((it) => (
            <SectionBlock
              key={it.slug}
              slug={it.slug}
              file={it.file}
              sectionRef={(el) => { sectionRefs.current[it.slug] = el; }}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
