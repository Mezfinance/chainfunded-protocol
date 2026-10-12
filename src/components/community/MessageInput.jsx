import { useRef, useState } from "react";
import { Send, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { useCommunityModerator } from "@/hooks/useCommunityModerator";
import { communityApi } from "@/lib/communityApi";
import MentionPicker from "./MentionPicker";
import ReactionPicker from "./ReactionPicker";

const MAX_LEN = 2000;

// Find the @<word> currently under or just before the caret. Returns the
// prefix (without the @) and the [start, end] range to replace, or null
// when the caret isn't in a mention token.
function findActiveMention(text, caret) {
  if (!text || caret == null) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const prev = i > 0 ? text[i - 1] : " ";
      if (prev && /[A-Za-z0-9_]/.test(prev)) return null;
      const prefix = text.slice(i + 1, caret);
      if (!/^[A-Za-z0-9_]*$/.test(prefix)) return null;
      return { prefix, start: i, end: caret };
    }
    if (!/[A-Za-z0-9_]/.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Composer for posting a new message to the active channel.
 *
 *   - If wallet not connected: prompts the user to connect.
 *   - If no community token: triggers signIn() (one-time wallet popup per
 *     ~4 hour session).
 *   - On send: posts via the worker, clears the input, lets realtime
 *     deliver the new message back through the channel subscription so
 *     the local optimistic insert isn't required.
 */
export default function MessageInput({ channel, disabled, onPosted }) {
  const { isAuthenticated } = useAuth();
  const { isMod } = useCommunityModerator();
  const { token, signIn, signing, signOut } = useCommunityToken();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState(null); // { prefix, start, end } | null
  const taRef = useRef(null);

  if (!channel) return null;

  // Admin-only channels (announcements, auto-feeds) accept admins/mods even
  // when also flagged is_read_only — that flag only blocks non-admins.
  if (channel.is_admin_only && !isMod) {
    return (
      <div className="border-t border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground text-center">
        This channel is read-only.
      </div>
    );
  }
  if (channel.is_read_only && !channel.is_admin_only) {
    return (
      <div className="border-t border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground text-center">
        This channel is read-only.
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="border-t border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground text-center">
        Connect a wallet to post.
      </div>
    );
  }

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    let active = token;
    if (!active) {
      try {
        active = await signIn();
      } catch (err) {
        toast.error("Couldn't sign in to community", { description: err?.message });
        return;
      }
    }
    if (!active) return;
    setSending(true);
    try {
      await communityApi.postMessage(active, {
        channelId: channel.id,
        content: trimmed,
      });
      setValue("");
      // Realtime should append the new row, but reload as a fallback so
      // the author's own message shows up even if realtime is offline.
      if (onPosted) onPosted();
    } catch (err) {
      // 401 → token expired or rejected; clear and ask user to retry
      if (err?.status === 401) {
        signOut();
        toast.error("Session expired — tap send again to re-sign");
      } else {
        toast.error("Couldn't send", { description: err?.message });
      }
    } finally {
      setSending(false);
    }
  };

  const updateMentionState = (text, caret) => {
    setMention(findActiveMention(text, caret));
  };

  const handleChange = (e) => {
    const next = e.target.value;
    setValue(next);
    updateMentionState(next, e.target.selectionStart);
  };

  const handleSelect = (e) => {
    updateMentionState(value, e.target.selectionStart);
  };

  const insertEmoji = (emoji) => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      const pos = start + emoji.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handlePickHandle = (handle) => {
    if (!mention) return;
    const { start, end } = mention;
    const next = value.slice(0, start) + `@${handle} ` + value.slice(end);
    setValue(next);
    setMention(null);
    // Restore caret after the inserted handle + space
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const pos = start + handle.length + 2;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    // MentionPicker hijacks ArrowUp/Down/Enter/Tab/Escape when open.
    if (mention && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab")) return;
    if (mention && e.key === "Enter") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const remaining = MAX_LEN - value.length;
  const overlimit = remaining < 0;

  return (
    <div className="border-t border-border bg-card/50 px-3 py-2 relative">
      {mention && (
        <MentionPicker
          prefix={mention.prefix}
          onPick={handlePickHandle}
          onClose={() => setMention(null)}
        />
      )}
      <div className="flex items-end gap-2">
        <ReactionPicker
          trigger={
            <button
              type="button"
              aria-label="Insert emoji"
              className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>
          }
          onSelect={insertEmoji}
        />
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={`Message ${channel.emoji || ""} ${channel.name}`}
          disabled={disabled || sending}
          className="flex-1 resize-none bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 max-h-32"
        />
        <Button
          size="sm"
          // onPointerDown so the send fires on press, before any input blur
          // / mobile keyboard layout shift can swallow the click.
          onPointerDown={(e) => {
            if (sending || disabled || !value.trim() || overlimit) return;
            e.preventDefault();
            submit();
          }}
          disabled={sending || disabled || !value.trim() || overlimit}
          className="bg-primary text-primary-foreground gap-1.5 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          {sending ? "…" : signing ? "Signing" : "Send"}
        </Button>
      </div>
      <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-muted-foreground/70">
        <span>Enter to send · Shift+Enter for newline</span>
        <span className={overlimit ? "text-red-400" : ""}>
          {value.length > MAX_LEN - 200 ? `${remaining} left` : ""}
        </span>
      </div>
    </div>
  );
}
