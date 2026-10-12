/**
 * prerender.mjs
 *
 * Post-build script: creates route-specific static HTML copies in dist/ so
 * that social crawlers (Facebook, Twitter/X, LinkedIn, Slack, etc.) and
 * search engine bots receive the correct <title>, <meta description>, and
 * Open Graph tags for each public page — without needing to execute JS.
 *
 * How it works:
 *   1. Reads dist/index.html (homepage meta already correct from index.html).
 *   2. For each public route, replaces <title>, description, og:*, twitter:*,
 *      and canonical tags in a copy of that HTML.
 *   3. Writes the copy to dist/{route}/index.html.
 *   4. Vercel serves static files before applying SPA rewrites, so
 *      GET /FAQ → dist/FAQ/index.html (prerendered) ✓
 *
 * Usage:  node scripts/prerender.mjs   (runs automatically via npm run build)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST      = join(__dirname, "../dist");

// ── Route manifest ─────────────────────────────────────────────────────────
// Each entry produces dist/{path}/index.html with its own head tags.
// Keep these in sync with src/components/SEO.jsx usage in each page.
const ROUTES = [
  {
    path: "Funded",
    title: "Get funded — payouts in seconds, on-chain | ChainFunded",
    description:
      "Pass the challenge and a smart contract pays your USDC straight to your wallet — settled on-chain in one block. No payout desk, no approval queue.",
    canonical: "https://chainfunded.io/Funded",
  },
  {
    path: "FAQ",
    title: "FAQ — Frequently Asked Questions | ChainFunded",
    description:
      "Everything you need to know about ChainFunded: challenge rules, account sizes, payout process, LP deposits, and how on-chain prop trading works.",
    canonical: "https://chainfunded.io/FAQ",
  },
  {
    path: "Support",
    title: "Support — Help Centre | ChainFunded",
    description:
      "Get help with ChainFunded: browse trading guides, challenge rules, payout process, and frequently asked questions. Contact our support team for anything else.",
    canonical: "https://chainfunded.io/Support",
  },
  {
    path: "terms-of-service",
    title: "Terms of Service | ChainFunded",
    description:
      "ChainFunded Terms of Service — the rules, rights, and obligations governing use of the ChainFunded on-chain prop trading evaluation platform.",
    canonical: "https://chainfunded.io/terms-of-service",
  },
  {
    path: "privacy-policy",
    title: "Privacy Policy | ChainFunded",
    description:
      "ChainFunded Privacy Policy — how we collect, use, and protect your personal information when you use our on-chain prop trading platform.",
    canonical: "https://chainfunded.io/privacy-policy",
  },
];

const OG_IMAGE = "https://chainfunded.io/og-image.png";

// ── Helpers ────────────────────────────────────────────────────────────────
function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Replaces key head tags in the HTML template for a given route.
 * All replacements are attribute-safe.
 */
function stampMeta(html, { title, description, canonical }) {
  const t   = escapeAttr(title);
  const d   = escapeAttr(description);
  const url = escapeAttr(canonical);

  return html
    // <title>
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    // description
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${d}$2`
    )
    // canonical
    .replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
      `$1${url}$2`
    )
    // og:url
    .replace(
      /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
      `$1${url}$2`
    )
    // og:title
    .replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
      `$1${t}$2`
    )
    // og:description
    .replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${d}$2`
    )
    // og:image (ensure it's set)
    .replace(
      /(<meta\s+property="og:image"\s+content=")[^"]*(")/,
      `$1${escapeAttr(OG_IMAGE)}$2`
    )
    // twitter:title
    .replace(
      /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
      `$1${t}$2`
    )
    // twitter:description
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
      `$1${d}$2`
    )
    // twitter:image (ensure it's set)
    .replace(
      /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,
      `$1${escapeAttr(OG_IMAGE)}$2`
    );
}

// ── Main ───────────────────────────────────────────────────────────────────
const template = readFileSync(join(DIST, "index.html"), "utf-8");

for (const route of ROUTES) {
  const html    = stampMeta(template, route);
  const dir     = join(DIST, route.path);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html, "utf-8");

  console.log(`✓ prerendered → dist/${route.path}/index.html`);
}

console.log(`\n✓ Prerender complete — ${ROUTES.length} routes stamped.`);
