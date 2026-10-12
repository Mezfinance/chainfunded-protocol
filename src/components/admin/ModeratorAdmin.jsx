import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { communityApi } from "@/lib/communityApi";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Admin tab for managing community moderators. Admins (per the worker's
 * ADMIN_ADDRESSES env) can grant or revoke mod role for any wallet.
 */
export default function ModeratorAdmin() {
  const { token, signIn } = useCommunityToken();
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { moderators } = await communityApi.listModerators();
      setList(moderators || []);
    } catch (err) {
      toast.error("Couldn't load moderators", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const ensureToken = async () => token || await signIn();

  const add = async () => {
    const wallet = adding.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      toast.error("Enter a valid 0x… wallet address");
      return;
    }
    setBusy(wallet);
    try {
      const t = await ensureToken();
      if (!t) return;
      await communityApi.addModerator(t, wallet);
      setAdding("");
      load();
      toast.success("Moderator added");
    } catch (err) {
      toast.error("Couldn't add", { description: err?.message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (wallet) => {
    setBusy(wallet);
    try {
      const t = await ensureToken();
      if (!t) return;
      await communityApi.removeModerator(t, wallet);
      load();
      toast.success("Moderator removed");
    } catch (err) {
      toast.error("Couldn't remove", { description: err?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add moderator</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Mods can delete messages, pin posts, and mute users. They cannot grant other mod role or platform-ban users.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="0x…"
              className="flex-1 font-mono text-sm"
            />
            <Button size="sm" onClick={add} disabled={!!busy} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Current moderators</h3>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : list.length === 0 ? (
            <div className="text-xs text-muted-foreground">None yet — add one above.</div>
          ) : (
            <div className="space-y-1">
              {list.map((m) => (
                <div key={m.wallet_address} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/40">
                  <code className="text-xs font-mono text-foreground flex-1 truncate">
                    {m.wallet_address}
                  </code>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    by {shortAddr(m.granted_by)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(m.wallet_address)}
                    disabled={busy === m.wallet_address}
                    className="h-7 px-2 text-rose-400 hover:bg-rose-500/10 gap-1"
                  >
                    <X className="w-3 h-3" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
