import { useEffect, useRef, useState, useCallback } from "react";
import { communityApi } from "@/lib/communityApi";
import { supabase } from "@/lib/supabaseClient";

/**
 * Loads messages for the given channel and subscribes to realtime inserts /
 * updates. Returns the messages in chronological order (oldest first) so
 * the UI can render top-down with the input pinned at the bottom.
 */
export function useCommunityMessages(channelId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const { messages } = await communityApi.listMessages({ channelId });
      setMessages(Array.isArray(messages) ? messages : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: react to inserts and updates (deletes flip deleted_at).
  useEffect(() => {
    if (!channelId) return undefined;
    const channel = supabase
      .channel(`community-messages-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new;
          if (!row || row.deleted_at) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          setMessages((prev) => {
            // Remove if soft-deleted, otherwise replace in-place
            if (row.deleted_at) return prev.filter((m) => m.id !== row.id);
            const idx = prev.findIndex((m) => m.id === row.id);
            if (idx === -1) return [...prev, row];
            const next = prev.slice();
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [channelId]);

  return { messages, loading, error, reload: load };
}
