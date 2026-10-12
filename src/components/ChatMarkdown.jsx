/**
 * ChatMarkdown — compact markdown renderer for chat bubbles (the support bot and
 * the contract explainer). The models reply in markdown (bold, numbered lists,
 * inline `code`, links); without this it renders as raw `**asterisks**`. Colour
 * is inherited from the surrounding bubble, and code chips use a theme-agnostic
 * foreground tint so they read on both light and dark bubbles. Spacing is tight
 * for a chat context (no big article margins).
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

const components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <p className="font-semibold text-[1.05em] mt-1 mb-1.5">{children}</p>,
  h2: ({ children }) => <p className="font-semibold mt-2 mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold mt-2 mb-1">{children}</p>,
  hr: () => <hr className="my-2 border-current/15" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-current/25 pl-3 my-2 italic opacity-90">{children}</blockquote>
  ),
  a: ({ href, children }) => {
    const url = href || "";
    return url.startsWith("/") ? (
      <Link to={url} className="underline underline-offset-2 hover:opacity-80">{children}</Link>
    ) : (
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80 break-all">{children}</a>
    );
  },
  // Let `code` own the styling for both inline and fenced blocks (robust across
  // react-markdown versions that may not pass `inline`).
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const text = String(children ?? "");
    const block = props.inline === false || text.includes("\n") || /^language-/.test(className || "");
    return block ? (
      <code className="block bg-foreground/10 rounded-md p-2 my-2 overflow-x-auto text-[0.82em] font-mono whitespace-pre-wrap break-words">{children}</code>
    ) : (
      <code className="px-1 py-0.5 rounded bg-foreground/10 text-[0.85em] font-mono break-words">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-2"><table className="w-full text-[0.9em] border-collapse">{children}</table></div>
  ),
  th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border border-current/20">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 border border-current/15">{children}</td>,
};

export default function ChatMarkdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
