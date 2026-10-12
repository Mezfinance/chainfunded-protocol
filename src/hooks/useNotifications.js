import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "@/lib/communityApi";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";

const POLL_MS = 30_000;
const LIST_LIMIT = 50;
const READ_KEY = "cf_notif_read"; // locally-acknowledged notification ids

// Community notifications require a signed-in session to view. Platform
// notifications (payouts, trade events, affiliate, LP, CFG, wallet) are the
// user's own on-chain/account activity and show off the connected wallet
// alone — no signature required.
const COMMUNITY_TYPES = new Set(["mention", "reaction", "reply", "mod_action"]);

function visibleFor(items, hasToken) {
  const list = Array.isArray(items) ? items : [];
  return hasToken ? list : list.filter((n) => !COMMUNITY_TYPES.has(n.type));
}

function loadReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveReadIds(set) {
  // Cap so the list can't grow unbounded over time.
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set].slice(-500))); } catch {}
}

/**
 * Loads the connected wallet's notifications. Reads come straight from
 * Supabase (filtered by recipient) so platform notifications appear without
 * any signature. When the user has a community session token, community
 * notifications (mentions/replies/reactions/mod actions) are shown too and
 * mark-read is persisted server-side; without a token those are hidden and
 * mark-read is local-only. We never prompt a signature here.
 */
export function useNotifications() {
  const { address } = useAuth();
  const { token } = useCommunityToken();
  const hasToken = !!token;
  const [raw, setRaw] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadIds());
  const [loading, setLoading] = useState(false);

  const fetchOnce = useCallback(async () => {
    if (!address) { setRaw([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, payload, read_at, created_at")
        .eq("recipient_address", address.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      setRaw(Array.isArray(data) ? data : []);
    } catch { /* keep last good values */ }
    finally { setLoading(false); }
  }, [address]);

  // Initial fetch + polling.
  useEffect(() => {
    if (!address) { setRaw([]); return undefined; }
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(id);
  }, [address, fetchOnce]);

  // Realtime — prepend on INSERT for our address.
  useEffect(() => {
    if (!address) return undefined;
    const me = address.toLowerCase();
    const channel = supabase
      .channel(`notifications-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_address=eq.${me}` },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          setRaw((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev].slice(0, LIST_LIMIT);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [address]);

  // Merge locally-acknowledged reads so they survive polls/reloads even when
  // we can't persist server-side (no community token).
  const items = visibleFor(raw, hasToken).map((n) =>
    !n.read_at && readIds.has(n.id) ? { ...n, read_at: "local" } : n
  );
  const unread = items.filter((n) => !n.read_at).length;

  const markRead = useCallback((id) => {
    setReadIds((prev) => {
      const next = new Set(prev).add(id);
      saveReadIds(next);
      return next;
    });
    // Persist server-side too when signed in; never prompt a signature for this.
    if (token) notificationsApi.markRead(token, id).catch(() => {});
  }, [token]);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const n of raw) next.add(n.id);
      saveReadIds(next);
      return next;
    });
    if (token) notificationsApi.markAllRead(token).catch(() => {});
  }, [token, raw]);

  const reload = useCallback(() => { fetchOnce(); }, [fetchOnce]);

  return { items, unread, loading, markRead, markAllRead, reload, hasToken };
}
