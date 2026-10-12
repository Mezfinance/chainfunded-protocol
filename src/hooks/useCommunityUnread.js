import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

const EPOCH = "1970-01-01T00:00:00Z";

// Per-wallet, per-channel last-read cursor. Survives refreshes on the
// same device without needing the user to sign an EIP-191 message just
// to mark a channel read.
function lastReadKey(address, channelId) {
  return `cf_lastread_${address}_${channelId}`;
}
function readLocal(address, channelId) {
  try { return localStorage.getItem(lastReadKey(address, channelId)); } catch { return null; }
}
function writeLocal(address, channelId, iso) {
  try { localStorage.setItem(lastReadKey(address, channelId), iso); } catch { /* ignore */ }
}
function maxIso(...candidates) {
  let best = EPOCH;
  for (const c of candidates) {
    if (typeof c !== "string" || !c) continue;
    if (c > best) best = c;
  }
  return best;
}

/**
 * Computes unread message counts per channel for the given wallet.
 *
 * Strategy:
 *   1. Fetch the wallet's last_read_at per channel from community_reads.
 *   2. Merge with localStorage cursors using max(local, server) — the
 *      local cursor covers passive readers who never authenticated,
 *      the server cursor covers cross-device sync for authed users.
 *   3. For each channel, count messages newer than the merged cutoff.
 *   4. Subscribe to community_messages INSERT to bump counts in-place.
 *
 * Returns:
 *   {
 *     unread: { [channelId]: number },
 *     markRead: (channelId) => void,
 *   }
 *
 * markRead is optimistic — call it when the user opens a channel; the
 * worker /community/read endpoint persists the cursor server-side when
 * a token is available, but the local cursor written here always sticks.
 */
export function useCommunityUnread({ address, channels }) {
  const [unread, setUnread] = useState({});

  useEffect(() => {
    if (!address || !channels?.length) {
      setUnread({});
      return undefined;
    }
    let cancelled = false;
    const me = address.toLowerCase();

    async function compute() {
      const { data: reads } = await supabase
        .from("community_reads")
        .select("channel_id, last_read_at")
        .eq("wallet_address", me);
      const serverMap = new Map((reads || []).map((r) => [r.channel_id, r.last_read_at]));

      const counts = {};
      await Promise.all(channels.map(async (c) => {
        const since = maxIso(serverMap.get(c.id), readLocal(me, c.id));
        const { count } = await supabase
          .from("community_messages")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", c.id)
          .is("deleted_at", null)
          .gt("created_at", since);
        counts[c.id] = count || 0;
      }));
      if (!cancelled) setUnread(counts);
    }

    compute();

    // Realtime — bump count for the channel on new messages (skip own posts).
    const sub = supabase
      .channel(`community-unread-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          const row = payload.new;
          if (!row || !row.channel_id || row.deleted_at) return;
          if ((row.author_address || "").toLowerCase() === me) return;
          setUnread((prev) => ({ ...prev, [row.channel_id]: (prev[row.channel_id] || 0) + 1 }));
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(sub); };
  }, [address, channels?.length]);

  const markRead = useCallback((channelId) => {
    if (!address || !channelId) return;
    writeLocal(address.toLowerCase(), channelId, new Date().toISOString());
    setUnread((prev) => (prev[channelId] === 0 ? prev : { ...prev, [channelId]: 0 }));
  }, [address]);

  return { unread, markRead };
}
