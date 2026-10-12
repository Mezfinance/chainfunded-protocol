import { useState, useEffect, useCallback } from "react";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { workerPost } from "@/lib/workerApi";
import { Button } from "@/components/ui/button";
import { Star, Loader2, EyeOff, Eye, Sparkles, ExternalLink, RefreshCw } from "lucide-react";
import { explorerTxUrl } from "@/lib/thirdwebClient";
import { formatUsd, formatAccountSize } from "@/lib/reviews";

async function adminPost(path, body) {
  const res = await workerPost(path, body);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export default function ReviewsManager() {
  const { token, signIn } = useCommunityToken();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const ensureToken = useCallback(async () => token || (await signIn()), [token, signIn]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const t = await ensureToken();
      if (!t) { setError("Sign in with your admin wallet to manage reviews."); setLoading(false); return; }
      const res = await adminPost("/admin/reviews/queue", { token: t });
      setReviews(res.reviews || []);
    } catch (e) { setError(e?.message || "Failed to load reviews"); }
    setLoading(false);
  }, [ensureToken]);

  useEffect(() => { load(); }, [load]);

  const mutate = async (id, fn) => {
    setBusyId(id); setError("");
    try { const t = await ensureToken(); await fn(t); await load(); }
    catch (e) { setError(e?.message || "Action failed"); }
    setBusyId(null);
  };

  const toggleFeatured = (r) => mutate(r.id, (t) => adminPost("/admin/reviews/feature", { token: t, id: r.id, featured: !r.featured }));
  const setRank = (r, rank) => mutate(r.id, (t) => adminPost("/admin/reviews/feature", { token: t, id: r.id, featured_rank: rank === "" ? null : Number(rank) }));
  const toggleHidden = (r) => mutate(r.id, (t) => adminPost("/admin/reviews/hide", { token: t, id: r.id, hidden: r.status !== "hidden", reason: r.status !== "hidden" ? "admin" : null }));

  const featuredCount = reviews.filter((r) => r.featured && r.status === "published").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Reviews</h2>
          <p className="text-sm text-muted-foreground">
            {reviews.length} total · {featuredCount} featured on the landing.
            Feature to surface on the homepage; hide only for abuse or spam — never for being negative.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && !reviews.length ? (
        <p className="text-muted-foreground text-sm py-10 text-center">Loading…</p>
      ) : !reviews.length && !error ? (
        <p className="text-muted-foreground text-sm py-10 text-center">No reviews yet.</p>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.id} className={`rounded-lg border border-border bg-card/50 p-4 ${r.status === "hidden" ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />)}
                    </span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${r.verification === "payout" ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-primary/30 bg-primary/10 text-primary"}`}>
                      {r.verification === "payout" ? `Payout · ${formatUsd(r.payoutTotalUsdc || 0)}` : `Verified · ${formatAccountSize(r.accountSize || 0)}`}
                    </span>
                    {r.status === "flagged" && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-red-400/40 bg-red-400/10 text-red-300">Flagged</span>}
                    {r.status === "hidden" && <span className="text-[10px] text-muted-foreground">Hidden</span>}
                  </div>
                  <p className="font-semibold text-sm text-foreground truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1 font-mono">
                    {r.displayName} · {r.traderAddress?.slice(0, 10)}…
                    {r.payoutTxHash && (
                      <a href={explorerTxUrl(r.payoutTxHash)} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary/70 hover:text-primary">tx <ExternalLink className="w-2.5 h-2.5" /></a>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => toggleFeatured(r)}
                    disabled={busyId === r.id}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 border transition-colors ${r.featured ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {r.featured ? "Featured" : "Feature"}
                  </button>
                  {r.featured && (
                    <input
                      type="number"
                      defaultValue={r.featuredRank ?? ""}
                      onBlur={(e) => { if (String(e.target.value) !== String(r.featuredRank ?? "")) setRank(r, e.target.value); }}
                      placeholder="rank"
                      className="w-16 bg-background border border-border rounded px-2 py-1 text-xs text-right outline-none focus:border-primary"
                      title="Landing order (lower = first)"
                    />
                  )}
                  <button
                    onClick={() => toggleHidden(r)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    title={r.status === "hidden" ? "Unhide" : "Hide (abuse / spam only)"}
                  >
                    {r.status === "hidden" ? <><Eye className="w-3 h-3" /> Unhide</> : <><EyeOff className="w-3 h-3" /> Hide</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
