import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { communityApi } from "@/lib/communityApi";

const HANDLE_REGEX = /^[A-Za-z0-9_]{2,20}$/;

/**
 * Inline edit form for the user's own community profile.
 * Validates the handle client-side (server validates again).
 */
export default function ProfileEdit({ initial, onCancel, onSaved }) {
  const { token, signIn } = useCommunityToken();
  const [handle, setHandle] = useState(initial?.handle || "");
  const [isPrivate, setIsPrivate] = useState(!!initial?.is_private);
  const [saving, setSaving] = useState(false);

  const handleValid = handle === "" || HANDLE_REGEX.test(handle);

  const save = async () => {
    if (saving) return;
    if (!handleValid) {
      toast.error("Handle must be 2–20 chars: letters, numbers, underscore.");
      return;
    }
    setSaving(true);
    try {
      let active = token;
      if (!active) active = await signIn();
      if (!active) return;
      await communityApi.updateProfile(active, {
        handle: handle === "" ? null : handle,
        isPrivate,
      });
      onSaved?.();
    } catch (err) {
      if (err?.status === 409) {
        toast.error("Handle is already taken");
      } else {
        toast.error("Couldn't save profile", { description: err?.message });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Handle</label>
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="alphanumeric_underscore"
          maxLength={20}
          className="text-sm"
        />
        {handle && !handleValid && (
          <div className="text-[10px] text-red-400 mt-0.5">2–20 chars, letters / numbers / underscore</div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="w-3.5 h-3.5"
        />
        Private profile (hides verified stats)
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving} className="flex-1 bg-primary text-primary-foreground text-xs">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
