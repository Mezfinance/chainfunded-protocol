import { useMemo } from "react";
import { Pin } from "lucide-react";
import ProfileCard from "./ProfileCard";
import ReactionBar from "./ReactionBar";
import URLEmbedCard, { extractUrls } from "./URLEmbedCard";
import TradeShareCard from "./TradeShareCard";
import SystemMessageCard from "./SystemMessageCard";
import MessageActions from "./MessageActions";
import { formatUtcDate, formatUtcTime } from "@/lib/datetime";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "anon";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Badge precedence: admin > mod > funded > evaluation > no account.
// Returns null when the wallet has an active evaluation/funded role and no
// special hat — nothing to show beyond the handle.
function statusBadge(profile) {
  if (!profile) return null;
  if (profile.is_admin) {
    return { label: "Admin", className: "bg-red-500/15 text-red-300 border-red-500/30" };
  }
  if (profile.is_mod) {
    return { label: "Mod", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" };
  }
  if (profile.max_phase === 3) {
    return { label: "Funded", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  }
  if (profile.max_phase === 1 || profile.max_phase === 2) {
    return { label: "Evaluation", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  }
  if ((profile.accounts_total || 0) === 0) {
    return { label: "No account", className: "bg-muted/40 text-muted-foreground border-border" };
  }
  return null;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  return sameDay
    ? `${formatUtcTime(d)} UTC`
    : `${formatUtcDate(d, { year: false })} · ${formatUtcTime(d)} UTC`;
}

// Render content with @handle mentions highlighted. Splits on the
// HANDLE_MENTION_RE so the surrounding text and the mention tokens
// alternate.
function renderContent(content) {
  if (!content) return null;
  const parts = [];
  const re = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,20})/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    const before = content.slice(last, m.index + m[1].length);
    if (before) parts.push(<span key={key++}>{before}</span>);
    parts.push(
      <span key={key++} className="text-primary font-medium bg-primary/10 px-0.5 rounded">
        @{m[2]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(<span key={key++}>{content.slice(last)}</span>);
  return parts;
}

/**
 * Renders a single message with clickable profile, reactions, mentions,
 * URL embeds, and trade-share cards. Mod actions land in commit #4.
 */
export default function MessageItem({ message, reactions, profile, onReactToggle }) {
  const time = useMemo(() => formatTime(message.created_at), [message.created_at]);
  const urls = useMemo(() => extractUrls(message.content), [message.content]);
  const payloadKind = message.system_payload?.kind;
  const badge = statusBadge(profile);
  const displayName = profile?.handle ? `@${profile.handle}` : shortAddr(message.author_address);

  if (message.is_system) {
    return <SystemMessageCard message={message} />;
  }

  return (
    <div className={`group flex gap-2.5 py-1.5 px-2 rounded ${
      message.pinned ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-secondary/20"
    }`}>
      <ProfileCard address={message.author_address}>
        <button className="w-8 h-8 shrink-0 rounded-full bg-muted/40 hover:bg-muted/60 flex items-center justify-center text-[10px] font-mono text-muted-foreground transition-colors">
          {(message.author_address || "??").slice(2, 4).toUpperCase()}
        </button>
      </ProfileCard>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <ProfileCard address={message.author_address}>
            <button className="text-sm font-semibold text-foreground truncate hover:underline cursor-pointer">
              {displayName}
            </button>
          </ProfileCard>
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.className}`}>
              {badge.label}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/70">{time}</span>
          {message.edited_at && (
            <span className="text-[10px] text-muted-foreground/50 italic">edited</span>
          )}
          {message.pinned && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
              <Pin className="w-2.5 h-2.5" /> pinned
            </span>
          )}
          <div className="ml-auto">
            <MessageActions message={message} />
          </div>
        </div>
        {message.content && (
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {renderContent(message.content)}
          </div>
        )}
        {payloadKind === "trade_share" && (
          <TradeShareCard payload={message.system_payload} />
        )}
        {urls.length > 0 && (
          <div className="space-y-1.5">
            {urls.map((u) => <URLEmbedCard key={u} url={u} />)}
          </div>
        )}
        <ReactionBar
          messageId={message.id}
          reactions={reactions}
          onToggle={onReactToggle}
        />
      </div>
    </div>
  );
}
