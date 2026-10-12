import { useEffect, useState } from "react";
import { communityApi } from "@/lib/communityApi";

/**
 * Loads the channel list once on mount. Channels rarely change, so no
 * realtime subscription — the seed script + admin actions are the only
 * source of mutations.
 */
export function useCommunityChannels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { channels } = await communityApi.listChannels();
        if (cancelled) return;
        setChannels(Array.isArray(channels) ? channels : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Failed to load channels");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { channels, loading, error };
}
