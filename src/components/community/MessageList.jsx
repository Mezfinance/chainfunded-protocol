import { useEffect, useRef } from "react";
import MessageItem from "./MessageItem";

/**
 * Scrollable message list. Auto-scrolls to bottom when new messages arrive
 * AND the user was already near the bottom (so we don't yank them away
 * while they're scrolling history).
 */
export default function MessageList({ messages, loading, reactions, profiles, onReactToggle }) {
  const scrollRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  // Track whether the user is near the bottom before each render's effect.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = distanceFromBottom < 80;
  });

  // After messages change, snap to bottom if we were there before.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {loading && messages.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No messages here yet — be the first to post.
        </div>
      ) : (
        messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            reactions={reactions?.get(m.id)}
            profile={profiles?.get((m.author_address || "").toLowerCase())}
            onReactToggle={onReactToggle}
          />
        ))
      )}
    </div>
  );
}
