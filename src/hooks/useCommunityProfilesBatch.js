import { useEffect, useMemo, useRef, useState } from "react";
import { communityApi } from "@/lib/communityApi";

const STORAGE_KEY = "cf_community_profiles_v1";
const TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough for instant repeat loads,
                               // short enough that handle / mod changes propagate.

const cache = new Map();

// Hydrate from localStorage so the first paint after a reload already has
// handles + badges for previously-seen authors.
(function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { ts, entries } = JSON.parse(raw);
    if (!ts || Date.now() - ts > TTL_MS) return;
    if (!Array.isArray(entries)) return;
    for (const [k, v] of entries) cache.set(k, v);
  } catch { /* ignore */ }
})();

let persistScheduled = false;
function schedulePersist() {
  if (persistScheduled) return;
  persistScheduled = true;
  // Coalesce multiple cache writes within a tick into a single localStorage hit.
  setTimeout(() => {
    persistScheduled = false;
    try {
      const payload = { ts: Date.now(), entries: Array.from(cache.entries()) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* quota / private mode — silently skip */ }
  }, 0);
}

/**
 * Batch lookup of community profile metadata for a list of wallet addresses.
 * Returns { profiles, loading } where `profiles` is a Map<lowerAddress,
 * profile> suitable for keyed rendering in a chat list. Profile shape:
 *   { handle, is_private, is_admin, is_mod, max_phase, accounts_total }
 *
 * Cache is module-level + persisted to localStorage with a 30-minute TTL so
 * subsequent page loads render handles + badges on first paint.
 *
 * `loading` is true while there are addresses in the current set that
 * haven't been resolved yet (either from cache or a successful fetch).
 */
export function useCommunityProfilesBatch(addresses) {
  const key = useMemo(() => {
    if (!Array.isArray(addresses)) return "";
    const dedup = Array.from(
      new Set(addresses.filter(Boolean).map((a) => String(a).toLowerCase()))
    ).sort();
    return dedup.join(",");
  }, [addresses]);

  const [, force] = useState(0);
  const inflight = useRef(new Set());

  useEffect(() => {
    if (!key) return;
    const all = key.split(",").filter(Boolean);
    const missing = all.filter((a) => !cache.has(a) && !inflight.current.has(a));
    if (missing.length === 0) return;
    missing.forEach((a) => inflight.current.add(a));
    let cancelled = false;
    (async () => {
      try {
        const { profiles } = await communityApi.getProfilesBatch(missing);
        if (cancelled) return;
        for (const a of missing) {
          cache.set(a, profiles?.[a] || null);
          inflight.current.delete(a);
        }
        schedulePersist();
        force((n) => n + 1);
      } catch {
        for (const a of missing) inflight.current.delete(a);
        force((n) => n + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const all = key ? key.split(",").filter(Boolean) : [];
  const loading = all.some((a) => !cache.has(a));

  const profiles = useMemo(() => {
    const map = new Map();
    for (const a of all) map.set(a, cache.get(a) || null);
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading]);

  return { profiles, loading };
}
