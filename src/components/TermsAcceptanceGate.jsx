import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Shield, ChevronDown } from "lucide-react";
import { recordTermsAcceptance } from "@/lib/termsAcceptance";

/**
 * Minimal markdown-to-HTML for the T&Cs document.
 * Handles: headings, bold, lists, tables, horizontal rules, paragraphs, links.
 */
function renderMarkdown(md) {
  const lines = md.split("\n");
  const html = [];
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headerCells = tableRows[0];
    const bodyRows = tableRows.slice(2); // skip separator row
    let t = '<table class="tc-table"><thead><tr>';
    headerCells.forEach((c) => (t += `<th>${inlineFormat(c)}</th>`));
    t += "</tr></thead><tbody>";
    bodyRows.forEach((row) => {
      t += "<tr>";
      row.forEach((c) => (t += `<td>${inlineFormat(c)}</td>`));
      t += "</tr>";
    });
    t += "</tbody></table>";
    html.push(t);
    tableRows = [];
    inTable = false;
  };

  const inlineFormat = (text) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table row
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      // Skip separator rows (|---|---|)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      tableRows.push(cells);
      inTable = true;
      continue;
    }
    if (inTable) flushTable();

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
      continue;
    }
    // Headings
    if (line.startsWith("### ")) {
      html.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      html.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      continue;
    }
    // List items
    if (/^- \(/.test(line.trim()) || /^- /.test(line.trim())) {
      html.push(`<li>${inlineFormat(line.trim().slice(2))}</li>`);
      continue;
    }
    // Empty line
    if (line.trim() === "") {
      continue;
    }
    // Paragraph
    html.push(`<p>${inlineFormat(line)}</p>`);
  }
  if (inTable) flushTable();

  return html.join("\n");
}

/**
 * Compute a SHA-256 hex digest of the terms document content.
 * Used as a version identifier for the acceptance audit trail.
 */
async function hashTermsContent(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function TermsAcceptanceGate({ onAccept, variant = "standard", walletAddress }) {
  const [checked, setChecked] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [termsHtml, setTermsHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [termsVersion, setTermsVersion] = useState("");
  const scrollRef = useRef(null);

  // Fetch T&Cs markdown, render, and compute version hash
  useEffect(() => {
    (async () => {
      try {
        const file = variant === "whitelist" ? "/whitelist-terms-and-conditions.md" : "/terms-and-conditions.md";
        const res = await fetch(file);
        const md = await res.text();
        setTermsHtml(renderMarkdown(md));
        setTermsVersion(await hashTermsContent(md));
      } catch (err) {
        console.error("Failed to load terms:", err);
        setTermsHtml("<p>Failed to load Terms and Conditions. Please refresh the page.</p>");
      } finally {
        setLoading(false);
      }
    })();
  }, [variant]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "bottom" when within 40px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  }, [hasScrolledToBottom]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center gap-4 max-w-3xl mx-auto px-4">
      <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center glow-green">
        <Shield className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-grotesk font-bold text-foreground mb-1">
          Terms and Conditions
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Please read the entire agreement below. You must scroll to the bottom before you can accept.
        </p>
      </div>

      <Card className="w-full border-border/60 bg-card/50">
        <CardContent className="p-0">
          {/* Scrollable T&Cs container */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[50vh] overflow-y-auto p-6 terms-content"
            style={{ scrollBehavior: "smooth" }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading Terms and Conditions...
              </div>
            ) : (
              <div
                className="text-left text-sm text-muted-foreground prose-terms"
                dangerouslySetInnerHTML={{ __html: termsHtml }}
              />
            )}
          </div>

          {/* Scroll indicator */}
          {!hasScrolledToBottom && !loading && (
            <div className="flex items-center justify-center py-2 border-t border-border/40 bg-card/80 text-xs text-muted-foreground gap-1 animate-pulse">
              <ChevronDown className="w-3 h-3" />
              Scroll down to read the full agreement
              <ChevronDown className="w-3 h-3" />
            </div>
          )}

          {/* Acceptance area */}
          <div className="p-4 border-t border-border/40 space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms-gate"
                checked={checked}
                onCheckedChange={setChecked}
                disabled={!hasScrolledToBottom}
              />
              <label
                htmlFor="terms-gate"
                className={`text-sm leading-snug cursor-pointer ${
                  hasScrolledToBottom
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                {variant === "whitelist"
                  ? "I confirm I am at least 18 years of age and have read and agree to the Terms and Conditions, including the Evaluation Programme Terms, Whitelisted Account Terms, Privacy Policy, and Risk Disclosure Statement."
                  : "I confirm I am at least 18 years of age and have read and agree to the Terms and Conditions, including the Evaluation Programme Terms, Privacy Policy, and Risk Disclosure Statement."}
              </label>
            </div>

            <Button
              onClick={() => {
                if (walletAddress && termsVersion) {
                  recordTermsAcceptance({
                    walletAddress,
                    termsVersion,
                    variant,
                  });
                }
                onAccept();
              }}
              disabled={!checked}
              className="w-full bg-primary text-primary-foreground"
            >
              Accept Terms & Continue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline styles for the rendered terms content */}
      <style>{`
        .prose-terms h1 {
          font-size: 1.25rem;
          font-weight: 700;
          color: hsl(var(--foreground));
          margin: 1.5rem 0 0.5rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid hsl(var(--border));
        }
        .prose-terms h2 {
          font-size: 1.1rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin: 1.25rem 0 0.4rem;
          padding-bottom: 0.2rem;
          border-bottom: 1px solid hsl(var(--border) / 0.4);
        }
        .prose-terms h3 {
          font-size: 1rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin: 1rem 0 0.3rem;
        }
        .prose-terms p {
          margin: 0.4rem 0;
          line-height: 1.6;
        }
        .prose-terms li {
          margin: 0.2rem 0 0.2rem 1rem;
          list-style-type: disc;
          line-height: 1.5;
        }
        .prose-terms strong {
          color: hsl(var(--foreground));
        }
        .prose-terms hr {
          border: none;
          border-top: 1px solid hsl(var(--border) / 0.5);
          margin: 1rem 0;
        }
        .prose-terms a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .prose-terms code {
          background: hsl(var(--muted));
          padding: 0.1rem 0.3rem;
          border-radius: 0.2rem;
          font-size: 0.85em;
        }
        .prose-terms .tc-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          font-size: 0.8rem;
        }
        .prose-terms .tc-table th,
        .prose-terms .tc-table td {
          border: 1px solid hsl(var(--border));
          padding: 0.35rem 0.5rem;
          text-align: left;
        }
        .prose-terms .tc-table th {
          background: hsl(var(--muted));
          font-weight: 600;
          color: hsl(var(--foreground));
        }
      `}</style>
    </div>
  );
}
