import { useEffect, useState } from "react";
import { Trash2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { formatUtcDateTime } from "@/lib/datetime";
import { useCommunityModerator } from "@/hooks/useCommunityModerator";
import { communityApi } from "@/lib/communityApi";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "anon";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Pending-flag queue for moderators. Each row shows the offending message
 * inline + reporter + reason, with one-tap Delete or Dismiss.
 *
 * Rendered inside Community when ?view=mod-queue and the viewer is a mod.
 */
export default function ModQueue() {
  const { token, signIn } = useCommunityToken();
  const { isMod } = useCommunityModerator();
  const [queue, setQueue] = useState({ flags: [], messages: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    if (!isMod) return;
    setLoading(true);
    try {
      let active = token;
      if (!active) active = await signIn();
      if (!active) return;
      const res = await communityApi.modQueue(active);
      setQueue({ flags: res.flags || [], messages: res.messages || [] });
    } catch (err) {
      toast.error("Couldn't load queue", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isMod]);

  if (!isMod) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="text-base font-semibold text-foreground">Moderators only</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ask an admin to grant you mod role.
          </p>
        </div>
      </div>
    );
  }

  const messageById = new Map(queue.messages.map((m) => [m.id, m]));

  const handle = async (flag, action) => {
    if (busy) return;
    setBusy(flag.id);
    try {
      let active = token;
      if (!active) active = await signIn();
      if (!active) return;
      await communityApi.resolveFlag(active, { flagId: flag.id, action });
      setQueue((q) => ({ ...q, flags: q.flags.filter((f) => f.id !== flag.id) }));
      toast.success(action === "delete" ? "Deleted" : "Dismissed");
    } catch (err) {
      toast.error("Action failed", { description: err?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-grotesk font-bold text-foreground">Moderation Queue</h2>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="text-xs">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {queue.flags.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No pending flags. Nice and quiet.
          </div>
        )}

        {queue.flags.map((f) => {
          const msg = messageById.get(f.message_id);
          return (
            <Card key={f.id} className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Reported by {shortAddr(f.reporter_address)}</span>
                  <span>·</span>
                  <span>#{msg?.channel_id || "?"}</span>
                  <span className="ml-auto">{formatUtcDateTime(f.created_at, { year: true })}</span>
                </div>
                {f.reason && (
                  <div className="text-xs text-foreground/80 italic">"{f.reason}"</div>
                )}
                {msg ? (
                  <div className="rounded border border-border bg-background/50 p-2">
                    <div className="text-[11px] text-muted-foreground mb-0.5">
                      {shortAddr(msg.author_address)} · {formatUtcDateTime(msg.created_at, { year: true })}
                      {msg.deleted_at && <span className="ml-2 text-rose-400">[deleted]</span>}
                    </div>
                    <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                      {msg.content || "(no content)"}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">Original message not found.</div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === f.id}
                    onClick={() => handle(f, "dismiss")}
                    className="text-xs gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === f.id}
                    onClick={() => handle(f, "delete")}
                    className="text-xs gap-1 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete message
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
