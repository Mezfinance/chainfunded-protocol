/**
 * TerminalFooter — slim status/links bar pinned to the bottom of the
 * trading terminal (desktop only; mobile uses the bottom tab bar).
 *
 * Props:
 *   connected — live price-feed connection status (drives the Online badge)
 */
import { Link } from "react-router-dom";

const DISCORD_URL = "https://discord.gg/EdYwteDTHq";
const X_URL = "https://x.com/chainfunded_io";
const DAO_URL = "https://chainfundeddao.org";

function DiscordIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.97 6.817H1.674l7.73-8.835L1.25 2.25h6.83l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/>
    </svg>
  );
}

function DaoIcon({ className }) {
  // ChainFunded DAO foundation mark (shield + bolt) — transparent background
  // so it reads on both light and dark surfaces (bolt is knocked out and
  // shows the surface through it).
  return (
    <img src="/brand/foundation-logo-mark.svg" alt="" aria-hidden="true" className={className} />
  );
}

export default function TerminalFooter({ connected }) {
  const year = new Date().getFullYear();
  return (
    <footer className="hidden lg:flex items-center justify-between shrink-0 border-t border-border bg-card pl-4 pr-24 py-1.5 text-xs">
      {/* Left: status + copyright */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${
          connected
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-primary" : "bg-red-400"}`} />
          {connected ? "Online" : "Offline"}
        </span>
        <span className="text-muted-foreground/70">© ChainFunded {year}</span>
      </div>

      {/* Right: links + socials */}
      <div className="flex items-center gap-4">
        <Link to="/terms-of-service" className="text-muted-foreground/70 hover:text-foreground transition-colors">
          Terms
        </Link>
        <Link to="/privacy-policy" className="text-muted-foreground/70 hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <span className="w-px h-4 bg-border" />
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Discord"
           className="text-muted-foreground/70 hover:text-foreground transition-colors">
          <DiscordIcon className="w-[22px] h-[22px]" />
        </a>
        <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="X"
           className="text-muted-foreground/70 hover:text-foreground transition-colors">
          <XIcon className="w-[18px] h-[18px]" />
        </a>
        <a href={DAO_URL} target="_blank" rel="noopener noreferrer" aria-label="ChainFunded DAO"
           className="opacity-80 hover:opacity-100 transition-opacity">
          <DaoIcon className="w-[22px] h-[22px]" />
        </a>
      </div>
    </footer>
  );
}
