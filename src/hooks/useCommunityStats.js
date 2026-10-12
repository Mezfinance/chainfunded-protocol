import { useEffect, useState } from "react";
import { communityApi } from "@/lib/communityApi";

const POLL_MS = 60_000;

/**
 * Polls /community/stats every 60s. Returns the four numbers shown in the
 * persistent stats bar above the channel rail. Initial fetch sets `loading`
 * — subsequent refreshes update silently.
 */
export function useCommunityStats() {
  const [stats, setStats] = useState({
    platformUsers: null,
    activePhase1: null,
    activePhase2: null,
    funded: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function tick() {
      try {
        const { stats } = await communityApi.getStats();
        if (cancelled || !stats) return;
        setStats({
          platformUsers: stats.platformUsers ?? 0,
          activePhase1: stats.activePhase1 ?? 0,
          activePhase2: stats.activePhase2 ?? 0,
          funded: stats.funded ?? 0,
        });
      } catch { /* keep last good values */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    timer = setInterval(tick, POLL_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, []);

  return { stats, loading };
}
