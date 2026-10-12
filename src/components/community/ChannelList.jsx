import { Link } from "react-router-dom";

const CATEGORY_ORDER = ["feeds", "talk", "support", "governance"];
const CATEGORY_LABELS = {
  feeds:      "Feeds",
  talk:       "Channels",
  support:    "Support",
  governance: "Governance",
};

/**
 * Sidebar list of community channels, grouped by category.
 *
 * Used in two layouts:
 *   - Desktop: persistent left rail (240px wide)
 *   - Mobile:  slide-over drawer triggered from the channel header
 *
 * Pure presentation — selection state is driven by `activeChannelId`,
 * and clicking a channel calls `onSelect(channelId)`.
 */
export default function ChannelList({ channels, activeChannelId, unread, onSelect }) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: channels.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5 py-3 px-2">
      {grouped.map(({ cat, items }) => (
        <div key={cat}>
          <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">
            {CATEGORY_LABELS[cat] || cat}
          </div>
          <div className="space-y-0.5">
            {items.map((c) => {
              const active = c.id === activeChannelId;
              const count = unread?.[c.id] || 0;
              const hasUnread = count > 0 && !active;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect?.(c.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : hasUnread
                        ? "text-foreground hover:bg-secondary/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <span className="text-base leading-none">{c.emoji || "#"}</span>
                  <span className={`truncate ${hasUnread ? "font-semibold" : ""}`}>{c.name}</span>
                  {hasUnread && (
                    <span className="ml-auto text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 min-w-[18px] text-center">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                  {!hasUnread && c.is_read_only && (
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground/60">
                      auto
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
