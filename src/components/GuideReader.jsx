import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, BookOpen } from "lucide-react";

const DOC_MODULES = import.meta.glob("/docs/**/*.md", {
  query: "?raw",
  import: "default",
});

export { DOC_MODULES };

export default function GuideReader({ slug, onBack }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) { setError(true); return; }
    const key = `/docs/${slug}.md`;
    const loader = DOC_MODULES[key];
    if (!loader) { setError(true); return; }
    setContent(null);
    setError(false);
    loader().then(setContent).catch(() => setError(true));
  }, [slug]);

  const resolveHref = (href) => {
    if (!href || href.startsWith("http")) return href;
    if (!href.endsWith(".md")) return href;
    const parts = href.replace(/^\.\.\//, "").replace(/^\.\//, "");
    const slugPart = parts.replace(/\.md$/, "");
    const resolved = slugPart.includes("/")
      ? slugPart
      : `${slug?.split("/")[0]}/${slugPart}`;
    return `/guides/${resolved}`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to How-To Guides
      </button>

      {error && (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground">Guide not found</p>
          <p className="text-xs text-muted-foreground">
            The guide you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
        </div>
      )}

      {!error && !content && (
        <div className="bg-card border border-border rounded-xl p-8">
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-secondary rounded w-2/3" />
            <div className="h-4 bg-secondary rounded w-full" />
            <div className="h-4 bg-secondary rounded w-5/6" />
            <div className="h-4 bg-secondary rounded w-4/5" />
          </div>
        </div>
      )}

      {content && (
        <article className="bg-card border border-border rounded-xl p-6 md:p-8 prose-guide">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const resolved = resolveHref(href);
                const isInternal = resolved && !resolved.startsWith("http");
                return isInternal ? (
                  <Link
                    to={resolved}
                    className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                  >
                    {children}
                  </Link>
                ) : (
                  <a href={resolved} target="_blank" rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
                    {children}
                  </a>
                );
              },
              h1: ({ children }) => (
                <h1 className="text-2xl md:text-3xl font-grotesk font-bold text-foreground mb-6">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-lg font-grotesk font-semibold text-foreground mt-8 mb-3 border-b border-border pb-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside pl-5 space-y-1 mb-4 text-sm text-muted-foreground">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside pl-5 space-y-1 mb-4 text-sm text-muted-foreground">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              code: ({ inline, children }) =>
                inline ? (
                  <code className="px-1 py-0.5 bg-secondary rounded text-xs font-mono text-foreground">{children}</code>
                ) : (
                  <pre className="bg-secondary rounded-lg p-4 overflow-x-auto mb-4">
                    <code className="text-xs font-mono text-foreground">{children}</code>
                  </pre>
                ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-primary/40 pl-4 my-4 text-xs text-muted-foreground italic">{children}</blockquote>
              ),
              hr: () => <hr className="border-border my-6" />,
              table: ({ children }) => (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
              th: ({ children }) => (
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground border border-border">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2.5 text-xs text-muted-foreground border border-border">{children}</td>
              ),
              tr: ({ children }) => <tr className="even:bg-secondary/20">{children}</tr>,
              img: ({ src, alt }) => (
                <figure className="my-6">
                  {src ? (
                    <img src={src} alt={alt}
                      className="w-full rounded-lg border border-border shadow-sm"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextSibling.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div className="px-4 py-3 bg-secondary/50 border border-border rounded-lg items-center gap-2"
                    style={{ display: src ? "none" : "flex" }}>
                    <span className="text-xs text-muted-foreground">📸</span>
                    <span className="text-xs text-muted-foreground italic">{alt}</span>
                  </div>
                  {alt && src && (
                    <figcaption className="mt-1.5 text-xs text-muted-foreground text-center italic">{alt}</figcaption>
                  )}
                </figure>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      )}
    </div>
  );
}
