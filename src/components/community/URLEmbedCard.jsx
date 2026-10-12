import { ExternalLink, Hash } from "lucide-react";

// Detect supported URL types and render small inline cards. Pure
// client-side — no server scrape required for v1.

const ETHERSCAN_TX_RE  = /^https?:\/\/(?:\w+\.)?etherscan\.io\/tx\/(0x[a-fA-F0-9]{64})/i;
const ETHERSCAN_ADDR_RE = /^https?:\/\/(?:\w+\.)?etherscan\.io\/address\/(0x[a-fA-F0-9]{40})/i;
const TRADINGVIEW_RE   = /^https?:\/\/(?:www\.)?tradingview\.com\/(?:chart|symbols)\/?(.*)/i;

function shortHex(hex, head = 8, tail = 6) {
  if (!hex) return "";
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function classify(url) {
  let m = url.match(ETHERSCAN_TX_RE);
  if (m) return { kind: "etherscan-tx", value: m[1] };
  m = url.match(ETHERSCAN_ADDR_RE);
  if (m) return { kind: "etherscan-addr", value: m[1] };
  m = url.match(TRADINGVIEW_RE);
  if (m) return { kind: "tradingview", value: m[1] || "" };
  try {
    const u = new URL(url);
    return { kind: "generic", value: u.hostname };
  } catch {
    return null;
  }
}

export default function URLEmbedCard({ url }) {
  const meta = classify(url);
  if (!meta) return null;

  let icon = ExternalLink;
  let label = "";
  let detail = "";
  let badge = null;

  switch (meta.kind) {
    case "etherscan-tx":
      icon = Hash;
      label = "Etherscan transaction";
      detail = shortHex(meta.value);
      badge = "TX";
      break;
    case "etherscan-addr":
      icon = Hash;
      label = "Etherscan address";
      detail = shortHex(meta.value, 8, 6);
      badge = "ADDR";
      break;
    case "tradingview":
      label = "TradingView chart";
      detail = meta.value || url;
      badge = "TV";
      break;
    default:
      label = meta.value || url;
      detail = url;
  }

  const Icon = icon;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-start gap-2 max-w-full px-3 py-2 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors no-underline"
    >
      <div className="w-7 h-7 shrink-0 rounded-md bg-muted/50 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground bg-muted/60 px-1 py-0.5 rounded font-mono">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate font-mono">{detail}</div>
      </div>
    </a>
  );
}

// Pull URLs out of a message body and dedupe.
export function extractUrls(content) {
  if (!content) return [];
  const matches = content.match(/https?:\/\/[^\s<>"']+/g) || [];
  const seen = new Set();
  const out = [];
  for (const u of matches) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= 3) break;
  }
  return out;
}
