import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { communityApi } from "@/lib/communityApi";
import { createPageUrl } from "@/utils";

const POLL_HANDLE_INTERVAL_MS = 60_000; // refresh own handle every minute

/**
 * Subscribes globally to community_messages INSERTs that mention the
 * connected wallet's handle. Fires a clickable toast — tapping it
 * navigates to /community?channel=<id> with the message in view.
 *
 * Mount once near the app root (Layout.jsx). No-op if there's no
 * connected wallet or the wallet has no handle yet.
 */
export function useMentionNotifications() {
  const { address } = useAuth();
  const navigate = useNavigate();
  const handleRef = useRef(null);

  // Resolve and cache our own handle.
  useEffect(() => {
    if (!address) { handleRef.current = null; return undefined; }
    let cancelled = false;
    async function refresh() {
      try {
        const { profile } = await communityApi.getProfile(address);
        if (!cancelled) handleRef.current = profile?.handle || null;
      } catch {
        if (!cancelled) handleRef.current = null;
      }
    }
    refresh();
    const id = setInterval(refresh, POLL_HANDLE_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [address]);

  // Subscribe to new messages and toast on mention of our handle.
  useEffect(() => {
    if (!address) return undefined;
    const me = address.toLowerCase();
    const sub = supabase
      .channel(`community-mentions-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          const row = payload.new;
          if (!row || row.deleted_at) return;
          if ((row.author_address || "").toLowerCase() === me) return;
          const myHandle = handleRef.current;
          if (!myHandle) return;
          const mentions = Array.isArray(row.mentions) ? row.mentions : [];
          if (!mentions.includes(myHandle.toLowerCase())) return;

          toast(`You were mentioned in #${row.channel_id}`, {
            description: row.content?.slice(0, 140) || "(view in community)",
            action: {
              label: "Open",
              onClick: () => navigate(`${createPageUrl("Community")}?channel=${row.channel_id}`),
            },
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [address, navigate]);
}
