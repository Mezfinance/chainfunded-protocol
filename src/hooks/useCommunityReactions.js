import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Loads + maintains the reactions for a set of message IDs.
 *
 * Returns { reactions, reload } where `reactions` is a
 *   Map: messageId → emoji → { count, reactedByMe }
 *
 * `reload` re-fetches reactions for the current messageIds — call it after
 * a toggle so the UI updates even when Supabase realtime is offline.
 *
 * Subscribes to all community_reactions changes (no per-message filter
 * is supported by Supabase realtime), then filters by the messageIds
 * set in the handler.
 */
export function useCommunityReactions(messageIds, viewerAddress) {
  const [byMessage, setByMessage] = useState(new Map());
  const idsRef = useRef([]);
  const meRef = useRef("");
  idsRef.current = messageIds || [];
  meRef.current = (viewerAddress || "").toLowerCase();

  const fetchAll = useCallback(async () => {
    const ids = idsRef.current;
    if (!ids || ids.length === 0) {
      setByMessage(new Map());
      return;
    }
    const { data } = await supabase
      .from("community_reactions")
      .select("message_id, emoji, reactor_address")
      .in("message_id", ids);
    const idSet = new Set(ids);
    const me = meRef.current;
    const map = new Map();
    for (const r of data || []) {
      if (!idSet.has(r.message_id)) continue;
      let perEmoji = map.get(r.message_id);
      if (!perEmoji) { perEmoji = new Map(); map.set(r.message_id, perEmoji); }
      let agg = perEmoji.get(r.emoji);
      if (!agg) { agg = { count: 0, reactedByMe: false }; perEmoji.set(r.emoji, agg); }
      agg.count += 1;
      if (r.reactor_address?.toLowerCase() === me) agg.reactedByMe = true;
    }
    setByMessage(map);
  }, []);

  useEffect(() => {
    if (!messageIds || messageIds.length === 0) {
      setByMessage(new Map());
      return undefined;
    }
    let cancelled = false;
    const idSet = new Set(messageIds);
    const me = (viewerAddress || "").toLowerCase();

    (async () => {
      const { data } = await supabase
        .from("community_reactions")
        .select("message_id, emoji, reactor_address")
        .in("message_id", messageIds);
      if (cancelled) return;
      const map = new Map();
      for (const r of data || []) {
        if (!idSet.has(r.message_id)) continue;
        let perEmoji = map.get(r.message_id);
        if (!perEmoji) { perEmoji = new Map(); map.set(r.message_id, perEmoji); }
        let agg = perEmoji.get(r.emoji);
        if (!agg) { agg = { count: 0, reactedByMe: false }; perEmoji.set(r.emoji, agg); }
        agg.count += 1;
        if (r.reactor_address?.toLowerCase() === me) agg.reactedByMe = true;
      }
      setByMessage(map);
    })();

    // Realtime — filter in JS to messages we care about
    const channel = supabase
      .channel(`community-reactions-${messageIds[0]}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_reactions" },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || !idSet.has(row.message_id)) return;
          // Re-fetch reactions for the affected message — simpler and
          // more correct than incrementally patching the map.
          supabase
            .from("community_reactions")
            .select("message_id, emoji, reactor_address")
            .eq("message_id", row.message_id)
            .then(({ data }) => {
              if (cancelled) return;
              setByMessage((prev) => {
                const next = new Map(prev);
                next.delete(row.message_id);
                if (data && data.length > 0) {
                  const perEmoji = new Map();
                  for (const r of data) {
                    let agg = perEmoji.get(r.emoji);
                    if (!agg) { agg = { count: 0, reactedByMe: false }; perEmoji.set(r.emoji, agg); }
                    agg.count += 1;
                    if (r.reactor_address?.toLowerCase() === me) agg.reactedByMe = true;
                  }
                  next.set(row.message_id, perEmoji);
                }
                return next;
              });
            });
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  // messageIds is recreated every render — depend on its length + first/last
  // to avoid re-subscribing on every keystroke. Approximation; new realtime
  // events will re-fetch the affected message anyway.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIds?.length, messageIds?.[0], messageIds?.[messageIds.length - 1], viewerAddress]);

  return { reactions: byMessage, reload: fetchAll };
}
