import { useState, useEffect } from "react";

/**
 * Minimal markdown-to-HTML renderer for legal documents.
 * Handles: headings, bold, italic, lists, tables, horizontal rules, links, code.
 */
function renderMarkdown(md) {
  const lines = md.split("\n");
  const html = [];
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headerCells = tableRows[0];
    const bodyRows = tableRows.slice(2);
    let t = '<table class="legal-table"><thead><tr>';
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
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) { tableRows.push(cells); inTable = true; continue; }
      tableRows.push(cells); inTable = true; continue;
    }
    if (inTable) flushTable();
    if (/^---+$/.test(line.trim())) { html.push("<hr />"); continue; }
    if (line.startsWith("### ")) { html.push(`<h3>${inlineFormat(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("## ")) { html.push(`<h2>${inlineFormat(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("# ")) { html.push(`<h1>${inlineFormat(line.slice(2))}</h1>`); continue; }
    if (/^- /.test(line.trim())) { html.push(`<li>${inlineFormat(line.trim().slice(2))}</li>`); continue; }
    if (line.startsWith("> ")) { html.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`); continue; }
    if (line.trim() === "") continue;
    html.push(`<p>${inlineFormat(line)}</p>`);
  }
  if (inTable) flushTable();
  return html.join("\n");
}

export default function MarkdownLegalContent({ file }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(file);
        const md = await res.text();
        setHtml(renderMarkdown(md));
      } catch {
        setHtml("<p>Failed to load document. Please refresh the page.</p>");
      } finally {
        setLoading(false);
      }
    })();
  }, [file]);

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">Loading...</div>;
  }

  return (
    <>
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
      <style>{`
        .legal-prose h1 { font-size: 1.25rem; font-weight: 700; color: hsl(var(--foreground)); margin: 1.5rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid hsl(var(--border)); }
        .legal-prose h2 { font-size: 1.1rem; font-weight: 600; color: hsl(var(--foreground)); margin: 1.25rem 0 0.4rem; padding-bottom: 0.2rem; border-bottom: 1px solid hsl(var(--border) / 0.4); }
        .legal-prose h3 { font-size: 1rem; font-weight: 600; color: hsl(var(--foreground)); margin: 1rem 0 0.3rem; }
        .legal-prose p { margin: 0.4rem 0; line-height: 1.6; color: hsl(var(--muted-foreground)); }
        .legal-prose li { margin: 0.2rem 0 0.2rem 1rem; list-style-type: disc; line-height: 1.5; color: hsl(var(--muted-foreground)); }
        .legal-prose strong { color: hsl(var(--foreground)); }
        .legal-prose hr { border: none; border-top: 1px solid hsl(var(--border) / 0.5); margin: 1rem 0; }
        .legal-prose a { color: hsl(var(--primary)); text-decoration: underline; }
        .legal-prose code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.2rem; font-size: 0.85em; }
        .legal-prose blockquote { border-left: 3px solid hsl(var(--border)); padding: 0.5rem 1rem; margin: 0.5rem 0; background: hsl(var(--muted) / 0.3); font-style: italic; }
        .legal-prose .legal-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.8rem; }
        .legal-prose .legal-table th, .legal-prose .legal-table td { border: 1px solid hsl(var(--border)); padding: 0.35rem 0.5rem; text-align: left; color: hsl(var(--muted-foreground)); }
        .legal-prose .legal-table th { background: hsl(var(--muted)); font-weight: 600; color: hsl(var(--foreground)); }
      `}</style>
    </>
  );
}
