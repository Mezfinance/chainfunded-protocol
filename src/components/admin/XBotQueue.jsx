import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { xbotApi } from "@/lib/communityApi";

// Per-row image fetch. The list endpoint omits image_b64 (~1.5 MB per row
// would OOM the worker), so each visible row asks for its own image once it
// scrolls into view, throttled through a shared concurrency pool so we don't
// flood the browser with parallel sockets (Chrome ERR_INSUFFICIENT_RESOURCES
// when too many concurrent fetches stack up on a long queue).

const MAX_CONCURRENT_IMAGE_FETCHES = 3;
const imageFetchQueue = [];
let imageFetchInFlight = 0;

function scheduleImageFetch(work) {
  return new Promise((resolve) => {
    const run = async () => {
      imageFetchInFlight++;
      try { resolve(await work()); }
      catch (e) { resolve({ error: e }); }
      finally {
        imageFetchInFlight--;
        const next = imageFetchQueue.shift();
        if (next) next();
      }
    };
    if (imageFetchInFlight < MAX_CONCURRENT_IMAGE_FETCHES) run();
    else imageFetchQueue.push(run);
  });
}

function LazyImage({ id, alt, ensureToken }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current || src) return undefined;
    let cancelled = false;
    const fetchImage = async () => {
      const result = await scheduleImageFetch(async () => {
        const t = await ensureToken();
        if (!t || cancelled) return { skipped: true };
        return xbotApi.image(t, id);
      });
      if (cancelled) return;
      if (result?.error || result?.skipped) { setError(true); return; }
      if (result?.image_b64) setSrc(`data:image/png;base64,${result.image_b64}`);
      else setError(true);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        fetchImage();
        io.disconnect();
      }
    }, { rootMargin: "100px" });
    io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [id, ensureToken, src]);

  return (
    <div ref={ref} className="w-full h-full rounded-md border border-border bg-secondary/30 overflow-hidden">
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
          image unavailable
        </div>
      ) : (
        <div className="w-full h-full animate-pulse bg-secondary/40" />
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { id: "pending_review", label: "Pending" },
  { id: "approved",       label: "Approved" },
  { id: "posted",         label: "Posted" },
  { id: "rejected",       label: "Rejected" },
];

const STATUS_PILL = {
  pending_review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved:       "bg-blue-500/15 text-blue-300 border-blue-500/30",
  posted:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:       "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function XBotQueue() {
  const { token, signIn } = useCommunityToken();
  const [filter, setFilter] = useState("pending_review");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Keep the token getter in a ref so it doesn't churn the load effect or
  // tear down LazyImage IntersectionObservers on every render. Without this,
  // useCommunityToken's signIn callback gets a fresh reference each parent
  // render (thirdweb's useActiveAccount returns new objects) → ensureToken
  // changes → load re-memoizes → useEffect fires → another /xbot/list → loop.
  // That manifested as a `ERR_INSUFFICIENT_RESOURCES` storm of POSTs on the
  // queue endpoint, and as silently-never-firing image observers.
  const ensureTokenRef = useRef(async () => null);
  useEffect(() => {
    ensureTokenRef.current = async () => token || (await signIn());
  }, [token, signIn]);
  const ensureTokenStable = useCallback(() => ensureTokenRef.current(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await ensureTokenStable();
      if (!t) return;
      const { posts } = await xbotApi.list(t, { status: filter });
      setPosts(posts || []);
    } catch (err) {
      toast.error("Failed to load queue", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [filter, ensureTokenStable]);

  useEffect(() => { load(); }, [load]);

  const onApprove = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const t = await ensureTokenStable();
      if (!t) return;
      await xbotApi.approve(t, id);
      toast.success("Approved — will post within 15 min");
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast.error("Approve failed", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id) => {
    if (busyId) return;
    const reason = window.prompt("Optional rejection reason (logged for context):") || null;
    setBusyId(id);
    try {
      const t = await ensureTokenStable();
      if (!t) return;
      await xbotApi.reject(t, { id, reason });
      toast.success("Rejected");
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast.error("Reject failed", { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary/40 rounded-md p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === f.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading && posts.length === 0 ? (
        <div className="text-sm text-muted-foreground p-12 text-center">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-muted-foreground p-12 text-center border border-dashed border-border rounded-md">
          No posts in this state.
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li
              key={p.id}
              className="flex flex-col md:flex-row gap-4 p-4 border border-border rounded-md bg-card/40"
            >
              <div className="relative w-full md:w-64 aspect-square shrink-0">
                {p.media_type === "video" ? (
                  <div className="w-full h-full rounded-md border border-border bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                    <div className="bg-black/60 rounded-full w-14 h-14 flex items-center justify-center backdrop-blur-sm">
                      <div className="w-0 h-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-white ml-1" />
                    </div>
                  </div>
                ) : (
                  <LazyImage id={p.id} alt={p.topic} ensureToken={ensureTokenStable} />
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${STATUS_PILL[p.status] || ""}`}>
                    {p.status.replace("_", " ")}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${
                    p.media_type === "video"
                      ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                      : "bg-secondary/40 text-muted-foreground border-border"
                  }`}>
                    {p.media_type === "video" ? "Video" : (p.card_template || "image")}
                  </span>
                  <span className="text-[10px] text-muted-foreground/80">·</span>
                  <span className="text-[10px] text-muted-foreground/80">{relTime(p.created_at)}</span>
                </div>

                {p.media_type === "video" && p.video_path && (
                  <div className="text-[10px] font-mono text-muted-foreground/70 truncate" title={p.video_path}>
                    {p.video_path.split("/").pop()}
                  </div>
                )}

                <div className="text-xs text-muted-foreground italic">{p.topic}</div>

                <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-snug">
                  {p.body}
                </div>

                {p.rejected_reason && (
                  <div className="text-xs text-rose-300/80 italic">
                    Rejected: {p.rejected_reason}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1">
                  {p.status === "pending_review" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => onApprove(p.id)}
                        disabled={busyId === p.id}
                        className="bg-emerald-500/90 hover:bg-emerald-500 text-emerald-50 gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReject(p.id)}
                        disabled={busyId === p.id}
                        className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </>
                  )}
                  {p.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReject(p.id)}
                      disabled={busyId === p.id}
                      className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </Button>
                  )}
                  {p.status === "posted" && p.tweet_url && (
                    <a
                      href={p.tweet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View on X <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
