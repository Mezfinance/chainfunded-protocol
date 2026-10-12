import { useState } from "react";
import { MoreHorizontal, Flag, Trash2, Pin, MicOff } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { useCommunityModerator } from "@/hooks/useCommunityModerator";
import { communityApi } from "@/lib/communityApi";

const MUTE_DURATIONS = [
  { label: "1 hour",  seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days",  seconds: 604800 },
  { label: "Forever", seconds: null },
];

/**
 * Per-message kebab menu. Visible on hover (desktop) or always on mobile.
 * Shows actions appropriate to the viewer's role:
 *   - Anyone: Flag (except own message)
 *   - Author within 5 min: Delete
 *   - Mod / admin: Delete, Pin/Unpin, Mute author
 *
 * System messages get a stripped-down menu — Pin only.
 */
export default function MessageActions({ message }) {
  const { address } = useAuth();
  const { token, signIn } = useCommunityToken();
  const { isMod } = useCommunityModerator();
  const [busy, setBusy] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);

  const isOwn = !!address && address.toLowerCase() === (message.author_address || "").toLowerCase();
  const ageMs = Date.now() - new Date(message.created_at).getTime();
  const canSelfDelete = isOwn && ageMs < 5 * 60 * 1000;
  const canFlag = !!address && !isOwn && !message.is_system;
  const canMod = isMod;

  if (!canFlag && !canSelfDelete && !canMod) return null;

  const ensureToken = async () => {
    if (token) return token;
    return await signIn();
  };

  const wrap = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      const t = await ensureToken();
      if (!t) return;
      await fn(t);
    } catch (err) {
      toast.error(err?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleFlag = () => wrap(async (t) => {
    await communityApi.flag(t, { messageId: message.id });
    toast.success("Flagged for review");
  });

  const handleDelete = () => wrap(async (t) => {
    await communityApi.deleteMessage(t, message.id);
    toast.success("Message deleted");
  });

  const handlePin = () => wrap(async (t) => {
    await communityApi.pin(t, { messageId: message.id, pinned: !message.pinned });
    toast.success(message.pinned ? "Unpinned" : "Pinned");
  });

  const handleMute = (seconds) => wrap(async (t) => {
    await communityApi.mute(t, {
      wallet: message.author_address,
      durationSeconds: seconds,
    });
    toast.success("User muted");
    setMuteOpen(false);
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground"
          aria-label="Message actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="p-1 w-44">
        <div className="space-y-0.5 text-sm">
          {canFlag && (
            <ActionButton icon={Flag} label="Flag" onClick={handleFlag} />
          )}
          {(canSelfDelete || canMod) && (
            <ActionButton icon={Trash2} label="Delete" onClick={handleDelete} danger />
          )}
          {canMod && !message.is_system && (
            <ActionButton
              icon={Pin}
              label={message.pinned ? "Unpin" : "Pin"}
              onClick={handlePin}
            />
          )}
          {canMod && !isOwn && message.author_address && (
            <Popover open={muteOpen} onOpenChange={setMuteOpen}>
              <PopoverTrigger asChild>
                <ActionButton icon={MicOff} label="Mute author" onClick={() => setMuteOpen(true)} />
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="p-1 w-32">
                <div className="space-y-0.5 text-sm">
                  {MUTE_DURATIONS.map((d) => (
                    <ActionButton
                      key={d.label}
                      label={d.label}
                      onClick={() => handleMute(d.seconds)}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionButton({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
        danger
          ? "text-rose-400 hover:bg-rose-500/10"
          : "text-foreground hover:bg-secondary/60"
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}
