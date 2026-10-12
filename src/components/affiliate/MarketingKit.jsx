import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Shapes,
  X,
} from "lucide-react";

// ─── SVG Asset manifest ──────────────────────────────────────────────────────
// Served from `public/affiliate-pack/` → /affiliate-pack/social-NN.svg
const IMAGES = [
  { n: 1,  file: "social-01.svg", tagline: "Trade. Earn. Grow. All On-Chain.",         size: "1080×1080", fmt: "square",    hero: false },
  { n: 2,  file: "social-02.svg", tagline: "Payouts in Seconds. Not Weeks.",           size: "1080×1080", fmt: "square",    hero: true  },
  { n: 3,  file: "social-03.svg", tagline: "Your Skill. Protocol Capital.",            size: "1080×1080", fmt: "square",    hero: false },
  { n: 4,  file: "social-04.svg", tagline: "Pass the Challenge. Get Funded.",          size: "1080×1080", fmt: "square",    hero: false },
  { n: 5,  file: "social-05.svg", tagline: "Your Wallet. Your Keys. Your Payouts.",    size: "1080×1080", fmt: "square",    hero: false },
  { n: 6,  file: "social-06.svg", tagline: "Up to $200K Evaluation Capital.",          size: "1080×1080", fmt: "square",    hero: false },
  { n: 7,  file: "social-07.svg", tagline: "Crypto-Native Funded Trading.",            size: "1080×1080", fmt: "square",    hero: false },
  { n: 8,  file: "social-08.svg", tagline: "Trustless. Transparent. Funded.",          size: "1080×1080", fmt: "square",    hero: false },
  { n: 9,  file: "social-09.svg", tagline: "Chain-Verified. Trader-Approved.",         size: "1080×1080", fmt: "square",    hero: false },
  { n: 10, file: "social-10.svg", tagline: "Sign. Trade. Withdraw. Repeat.",           size: "1080×1080", fmt: "square",    hero: false },
  { n: 11, file: "social-11.svg", tagline: "Prove Your Edge. Trade Protocol Capital.", size: "1200×675",  fmt: "landscape", hero: false },
  { n: 12, file: "social-12.svg", tagline: "Decentralised Prop Trading.",              size: "1200×675",  fmt: "landscape", hero: false },
  { n: 13, file: "social-13.svg", tagline: "Trade USDC. Earn USDC. Keep USDC.",        size: "1200×675",  fmt: "landscape", hero: false },
  { n: 14, file: "social-14.svg", tagline: "The Future of Prop Trading is On-Chain.",  size: "1200×675",  fmt: "landscape", hero: false },
  { n: 15, file: "social-15.svg", tagline: "No Banks. No Middlemen. Just Capital.",    size: "1200×675",  fmt: "landscape", hero: false },
  { n: 16, file: "social-16.svg", tagline: "From Trader to Funded — On-Chain.",        size: "1080×1920", fmt: "story",     hero: false },
  { n: 17, file: "social-17.svg", tagline: "Automatic Payouts. Every Time.",           size: "1080×1920", fmt: "story",     hero: false },
  { n: 18, file: "social-18.svg", tagline: "Beat the Challenge. Earn the Payout.",     size: "1080×1920", fmt: "story",     hero: false },
  { n: 19, file: "social-19.svg", tagline: "Two Phases. One Payout. Infinite Upside.", size: "1080×1920", fmt: "story",     hero: false },
  { n: 20, file: "social-20.svg", tagline: "Join the Funded Revolution.",              size: "1080×1920", fmt: "story",     hero: false },
  { n: 21, file: "social-21.svg", tagline: "7.5M CFG Season 1 Rewards Pool.",          size: "1080×1080", fmt: "square",    hero: true  },
  { n: 22, file: "social-22.svg", tagline: "How to Earn CFG — Trader & LP Paths.",     size: "1080×1080", fmt: "square",    hero: false },
  { n: 23, file: "social-23.svg", tagline: "Buy 1 Get 1 Free — 10 Spots, 24 Hours.",  size: "1080×1080", fmt: "square",    hero: true  },
];

const IMAGE_FILTERS = [
  { key: "all",       label: "All",       count: 23 },
  { key: "square",    label: "Square",    count: 13, sub: "1080×1080" },
  { key: "landscape", label: "Landscape", count: 5,  sub: "1200×675"  },
  { key: "story",     label: "Story",     count: 5,  sub: "1080×1920" },
];

// ─── Video Asset manifest ────────────────────────────────────────────────────
// Served from `public/affiliate-pack/videos/` → /affiliate-pack/videos/*.mp4
const VIDEOS = [
  // Vertical/Story videos (1080×1920)
  { n: "01",    file: "chainfunded-video-01-1080x1920-payouts-in-seconds-audio.mp4",        title: "Payouts in Seconds",     size: "1080×1920", fmt: "story",     hero: true  },
  { n: "02",    file: "chainfunded-video-02-1080x1920-funded-math-audio.mp4",               title: "Funded Math",            size: "1080×1920", fmt: "story",     hero: false },
  { n: "03",    file: "chainfunded-video-03-1080x1920-200k-capital-audio.mp4",              title: "$200K Capital",          size: "1080×1920", fmt: "story",     hero: false },
  { n: "04",    file: "chainfunded-video-04-1080x1920-90-profit-split-audio.mp4",           title: "90% Profit Split",       size: "1080×1920", fmt: "story",     hero: false },
  { n: "05",    file: "chainfunded-video-05-1080x1920-fully-on-chain-audio.mp4",            title: "Fully On-Chain",         size: "1080×1920", fmt: "story",     hero: false },
  { n: "06",    file: "chainfunded-video-06-1080x1920-start-the-challenge-audio.mp4",       title: "Start the Challenge",    size: "1080×1920", fmt: "story",     hero: false },
  { n: "13",    file: "chainfunded-video-13-1080x1920-cfg-season1-rewards-audio.mp4",       title: "CFG Season 1 Rewards",   size: "1080×1920", fmt: "story",     hero: true  },

  // Square videos for X/Twitter (1080×1080)
  { n: "01-sq", file: "chainfunded-video-01-sq-1080x1080-payouts-in-seconds-square-audio.mp4",  title: "Payouts in Seconds",     size: "1080×1080", fmt: "square", hero: false },
  { n: "02-sq", file: "chainfunded-video-02-sq-1080x1080-funded-math-square-audio.mp4",         title: "Funded Math",            size: "1080×1080", fmt: "square", hero: false },
  { n: "03-sq", file: "chainfunded-video-03-sq-1080x1080-200k-capital-square-audio.mp4",        title: "$200K Capital",          size: "1080×1080", fmt: "square", hero: false },
  { n: "04-sq", file: "chainfunded-video-04-sq-1080x1080-90-profit-split-square-audio.mp4",     title: "90% Profit Split",       size: "1080×1080", fmt: "square", hero: false },
  { n: "05-sq", file: "chainfunded-video-05-sq-1080x1080-fully-on-chain-square-audio.mp4",      title: "Fully On-Chain",         size: "1080×1080", fmt: "square", hero: false },
  { n: "06-sq", file: "chainfunded-video-06-sq-1080x1080-start-the-challenge-square-audio.mp4", title: "Start the Challenge",    size: "1080×1080", fmt: "square", hero: false },
  { n: "07",    file: "chainfunded-video-07-1080x1080-legacy-vs-chainfunded-audio.mp4",         title: "Legacy vs ChainFunded",  size: "1080×1080", fmt: "square", hero: false },
  { n: "08",    file: "chainfunded-video-08-1080x1080-live-stats-audio.mp4",                    title: "Live Stats",             size: "1080×1080", fmt: "square", hero: false },
  { n: "09",    file: "chainfunded-video-09-1080x1080-logo-sting-audio.mp4",                    title: "Logo Sting",             size: "1080×1080", fmt: "square", hero: false },
  { n: "10",    file: "chainfunded-video-10-1080x1080-affiliate-earnings-audio.mp4",            title: "Affiliate Earnings",     size: "1080×1080", fmt: "square", hero: false },
  { n: "11-sq", file: "chainfunded-video-11-sq-1080x1080-3-step-explainer-square-audio.mp4",    title: "3-Step Explainer",       size: "1080×1080", fmt: "square", hero: false },
  { n: "12-sq", file: "chainfunded-video-12-sq-1080x1080-feature-grid-square-audio.mp4",        title: "Feature Grid",           size: "1080×1080", fmt: "square", hero: false },
  { n: "13-sq", file: "chainfunded-video-13-sq-1080x1080-cfg-season1-rewards-square-audio.mp4", title: "CFG Season 1 Rewards",   size: "1080×1080", fmt: "square", hero: false },

  // Landscape videos (1920×1080)
  { n: "11",    file: "chainfunded-video-11-1920x1080-3-step-explainer-audio.mp4",          title: "3-Step Explainer",       size: "1920×1080", fmt: "landscape", hero: false },
  { n: "12",    file: "chainfunded-video-12-1920x1080-feature-grid-audio.mp4",              title: "Feature Grid",           size: "1920×1080", fmt: "landscape", hero: false },
];

const VIDEO_FILTERS = [
  { key: "all",       label: "All",       count: 22 },
  { key: "square",    label: "Square",    count: 13, sub: "1080×1080" },
  { key: "story",     label: "Story",     count: 7,  sub: "1080×1920" },
  { key: "landscape", label: "Landscape", count: 2,  sub: "1920×1080" },
];

// ─── ChainFunded logos ───────────────────────────────────────────────────────
// The official brand-kit SVGs, served from `public/brand/` → /brand/*.svg.
// `bg` chooses the preview backdrop so each mark sits on the background it's
// designed for (per the brand guidelines: green bolt on light, white bolt on
// dark). The full kit (colours + type) lives at /brand/chainfunded-brand-kit/.
const LOGOS = [
  { file: "logo-full.svg",                    name: "Full Logo — Mark + Wordmark", desc: "Horizontal lockup for headers & partner pages", bg: "light" },
  { file: "wordmark.svg",                     name: "Wordmark — Light Mode",       desc: "Dark text + green accent, for light backgrounds", bg: "light" },
  { file: "wordmark-white.svg",               name: "Wordmark — Dark Mode",        desc: "White text + green accent, for dark backgrounds", bg: "dark"  },
  { file: "logo-mark.svg",                    name: "Mark — Outline (primary)",    desc: "Green stroke on transparent",                     bg: "light" },
  { file: "logo-bolt-filled.svg",             name: "Mark — Filled",               desc: "Solid green bolt on transparent",                 bg: "light" },
  { file: "logo-mark-on-green.svg",           name: "Mark — On Green",             desc: "White bolt on green rounded square",              bg: "dark"  },
  { file: "logo-mark-on-light.svg",           name: "Mark — On Light",             desc: "Green bolt on light-green square",                bg: "light" },
  { file: "logo-bolt-on-green-transparent.svg", name: "Mark — Transparent Cutout", desc: "Green square, bolt punched through",             bg: "dark"  },
];

// Usage rules, verbatim from the brand kit (brand/chainfunded-brand-kit).
const BRAND_DO = [
  "Use the provided SVGs at any scale",
  "Maintain clear space around the logo (min 50% of logo height)",
  "Use the green bolt on white/light backgrounds; the white bolt on green/dark",
  "Write “ChainFunded” as one word, capital C and F",
];
const BRAND_DONT = [
  "Stretch, skew, or rotate the logo",
  "Change the logo colours",
  "Add drop shadows, outlines, or effects",
  "Use the logo smaller than 24px",
  "Write “Chain Funded”, “Chainfunded”, or “chain funded”",
];

function aspectClass(fmt) {
  if (fmt === "square") return "aspect-square";
  if (fmt === "landscape") return "aspect-video";
  return "aspect-[9/16]";
}

export default function MarketingKit() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("images"); // "images" | "videos" | "logos"
  const [imageFilter, setImageFilter] = useState("all");
  const [videoFilter, setVideoFilter] = useState("all");

  const filteredImages = imageFilter === "all" ? IMAGES : IMAGES.filter((a) => a.fmt === imageFilter);
  const filteredVideos = videoFilter === "all" ? VIDEOS : VIDEOS.filter((v) => v.fmt === videoFilter);

  const isImages = tab === "images";
  const isVideos = tab === "videos";
  const isLogos = tab === "logos";
  const filter = isImages ? imageFilter : videoFilter;
  const setFilter = isImages ? setImageFilter : setVideoFilter;
  const filters = isImages ? IMAGE_FILTERS : VIDEO_FILTERS;
  const totalCount = IMAGES.length + VIDEOS.length + LOGOS.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Marketing Kit</span>
          <Badge className="bg-primary/15 text-primary border-primary/25 text-xs">
            {totalCount} assets
          </Badge>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border">
          <p className="text-xs text-muted-foreground pt-4">
            Ready-to-post graphics and videos with ChainFunded branding. Pair with
            your referral link and post on X, Instagram, TikTok, or LinkedIn.
          </p>

          {/* Tabs: Images / Videos */}
          <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg w-fit">
            <button
              onClick={() => setTab("images")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isImages
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Images
              <span className="opacity-60">· {IMAGES.length}</span>
            </button>
            <button
              onClick={() => setTab("videos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isVideos
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Videos
              <span className="opacity-60">· {VIDEOS.length}</span>
            </button>
            <button
              onClick={() => setTab("logos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isLogos
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shapes className="w-3.5 h-3.5" />
              Logos
              <span className="opacity-60">· {LOGOS.length}</span>
            </button>
          </div>

          {/* Filter pills (images & videos only — logos aren't format-filtered) */}
          {!isLogos && (
          <div className="flex gap-2 flex-wrap">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    active
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 opacity-60">· {f.count}</span>
                  {f.sub && active && (
                    <span className="ml-1.5 opacity-60 hidden sm:inline">· {f.sub}</span>
                  )}
                </button>
              );
            })}
          </div>
          )}

          {/* Logos: intro line */}
          {isLogos && (
            <p className="text-xs text-muted-foreground">
              Official ChainFunded logos for co-branding. Vector SVGs — scale freely.
              Follow the usage rules below so the brand stays consistent everywhere
              you place it.
            </p>
          )}

          {/* Gallery grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {isImages && filteredImages.map((a) => <AssetTile key={a.n} asset={a} />)}
            {isVideos && filteredVideos.map((v) => <VideoTile key={v.n} video={v} />)}
            {isLogos  && LOGOS.map((l) => <LogoTile key={l.file} logo={l} />)}
          </div>

          {/* Logos: usage guidelines */}
          {isLogos && <BrandGuidelines />}

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {isLogos
                ? "Need colours & typography too? Open the full brand kit."
                : isImages
                ? "Full gallery includes usage guidelines and brand do/don'ts."
                : "Videos include background music. Include music credits when publishing."}
            </p>
            <a
              href={isLogos ? "/brand/chainfunded-brand-kit/" : "/affiliate-pack/"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {isLogos ? "Open brand kit" : "Open full pack"}
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image tile ──────────────────────────────────────────────────────────────
function AssetTile({ asset }) {
  const src = `/affiliate-pack/${asset.file}`;
  const num = String(asset.n).padStart(2, "0");

  return (
    <div className="group relative">
      <div className={`${aspectClass(asset.fmt)} bg-black rounded-lg overflow-hidden border border-border relative`}>
        <img
          src={src}
          alt={asset.tagline}
          className="w-full h-full object-contain"
          loading="lazy"
        />

        {asset.hero && (
          <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            Hero
          </div>
        )}

        {/* Hover overlay */}
        <a
          href={src}
          download={asset.file}
          title={`Download ${asset.tagline}`}
          className="absolute inset-0 flex items-center justify-center bg-black/75 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full px-3 py-1.5">
            <Download className="w-3.5 h-3.5" /> SVG
          </span>
        </a>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono text-primary shrink-0">#{num}</span>
        <span className="text-muted-foreground truncate" title={asset.tagline}>
          {asset.tagline}
        </span>
      </div>
    </div>
  );
}

// ─── Logo tile ───────────────────────────────────────────────────────────────
function LogoTile({ logo }) {
  const src = `/brand/${logo.file}`;
  // Sit each mark on the background it's designed for (per brand guidelines).
  const bg = logo.bg === "dark" ? "bg-[#13201a]" : "bg-white";

  return (
    <div className="group relative">
      <div className={`aspect-[4/3] ${bg} rounded-lg overflow-hidden border border-border relative flex items-center justify-center p-6`}>
        <img
          src={src}
          alt={logo.name}
          className="max-w-full max-h-full object-contain"
          loading="lazy"
        />

        {/* Hover download overlay */}
        <a
          href={src}
          download={logo.file}
          title={`Download ${logo.name}`}
          className="absolute inset-0 flex items-center justify-center bg-black/75 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full px-3 py-1.5">
            <Download className="w-3.5 h-3.5" /> SVG
          </span>
        </a>
      </div>

      <div className="mt-1.5">
        <p className="text-[11px] font-medium text-foreground truncate" title={logo.name}>{logo.name}</p>
        <p className="text-[10px] text-muted-foreground truncate" title={logo.desc}>{logo.desc}</p>
      </div>
    </div>
  );
}

// ─── Brand usage guidelines (verbatim from the brand kit) ─────────────────────
function BrandGuidelines() {
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-2 inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Do
          </p>
          <ul className="space-y-1.5">
            {BRAND_DO.map((t) => (
              <li key={t} className="flex gap-1.5 text-xs text-muted-foreground">
                <Check className="w-3 h-3 mt-0.5 shrink-0 text-primary" /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-xs font-semibold text-foreground mb-2 inline-flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Don't
          </p>
          <ul className="space-y-1.5">
            {BRAND_DONT.map((t) => (
              <li key={t} className="flex gap-1.5 text-xs text-muted-foreground">
                <X className="w-3 h-3 mt-0.5 shrink-0 text-foreground/60" /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Press inquiries: <a href="mailto:press@chainfunded.io" className="text-primary hover:underline">press@chainfunded.io</a>
      </p>
    </div>
  );
}

// ─── Video tile ──────────────────────────────────────────────────────────────
function VideoTile({ video }) {
  const src = `/affiliate-pack/videos/${video.file}`;

  const handleMouseEnter = (e) => {
    const videoEl = e.currentTarget.querySelector("video");
    if (videoEl) videoEl.play().catch(() => {});
  };

  const handleMouseLeave = (e) => {
    const videoEl = e.currentTarget.querySelector("video");
    if (videoEl) {
      videoEl.pause();
      videoEl.currentTime = 0;
    }
  };

  return (
    <div className="group relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className={`${aspectClass(video.fmt)} bg-black rounded-lg overflow-hidden border border-border relative`}>
        <video
          src={src}
          className="w-full h-full object-contain"
          muted
          loop
          playsInline
          preload="metadata"
        />

        {video.hero && (
          <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            Hero
          </div>
        )}

        {/* Format badge */}
        <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm text-white text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded">
          {video.fmt === "story" ? "9:16" : video.fmt === "landscape" ? "16:9" : "1:1"}
        </div>

        {/* Hover download overlay */}
        <a
          href={src}
          download={video.file}
          title={`Download ${video.title}`}
          className="absolute inset-0 flex items-end justify-center pb-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full px-3 py-1.5">
            <Download className="w-3.5 h-3.5" /> MP4
          </span>
        </a>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono text-primary shrink-0">#{video.n}</span>
        <span className="text-muted-foreground truncate" title={video.title}>
          {video.title}
        </span>
      </div>
    </div>
  );
}
