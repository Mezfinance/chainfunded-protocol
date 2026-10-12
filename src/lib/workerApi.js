// Worker HTTP helper with retry-on-503 for the leader-election gap.
//
// The worker runs as multi-region active-standby on Fly. In steady state,
// requests that land on a standby get a `fly-replay` header pointing at the
// current leader's machine, and Fly re-routes transparently — this helper
// never sees the 503. The retry logic is a fallback for two cases:
//   1. The leader has died and no replacement has been elected yet
//      (~30s gap during failover or right after a deploy).
//   2. Local dev where there's no Fly edge proxy to honour the header.

const RETRY_DELAYS_MS = [400, 800, 1600];
// Honour Retry-After header when present (Cloudflare / Fly edge / Supabase).
// Falls back to RETRY_DELAYS_MS[attempt] if header missing.
const RATE_LIMIT_DELAYS_MS = [800, 2000, 4000];

export async function workerPost(path, body) {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (!workerUrl) throw new Error("VITE_WORKER_URL is not configured");

  let attempt = 0;
  while (true) {
    const res = await fetch(`${workerUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // 503 with a leader-related message → retry with backoff.
    if (res.status === 503 && attempt < RETRY_DELAYS_MS.length) {
      // Need to peek at the body without consuming it for the caller.
      const cloned = res.clone();
      let parsed = null;
      try { parsed = await cloned.json(); } catch {}
      const msg = parsed?.error || "";
      if (/active leader|forwarding/i.test(msg)) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        attempt++;
        continue;
      }
    }

    // 429 from anywhere in the chain (Fly edge concurrency, Cloudflare in
    // front, Supabase). Retry with backoff so a transient burst doesn't fail
    // the user-facing toast. Caps at 3 retries (~7s total).
    if (res.status === 429 && attempt < RATE_LIMIT_DELAYS_MS.length) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : RATE_LIMIT_DELAYS_MS[attempt];
      await new Promise(r => setTimeout(r, delay));
      attempt++;
      continue;
    }

    return res;
  }
}
