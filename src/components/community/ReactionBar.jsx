import { Smile } from "lucide-react";
import ReactionPicker from "./ReactionPicker";

/**
 * Renders the existing reactions on a message as a row of emoji + count
 * pills. Tapping a pill toggles your reaction. The trailing add-reaction
 * button opens the picker.
 */
export default function ReactionBar({ messageId, reactions, onToggle }) {
  const entries = reactions ? [...reactions.entries()] : [];

  if (entries.length === 0) {
    // Picker only — empty state, hidden until message is hovered (parent
    // controls visibility via group-hover).
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <ReactionPicker
          trigger={
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground bg-secondary/40 border border-border"
              aria-label="Add reaction"
            >
              <Smile className="w-3 h-3" />
            </button>
          }
          onSelect={(emoji) => onToggle?.(messageId, emoji)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {entries.map(([emoji, agg]) => (
        <button
          key={emoji}
          onClick={() => onToggle?.(messageId, emoji)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
            agg.reactedByMe
              ? "bg-primary/15 border-primary/40 text-foreground"
              : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="text-sm leading-none">{emoji}</span>
          <span className="font-medium">{agg.count}</span>
        </button>
      ))}
      <ReactionPicker
        trigger={
          <button
            className="flex items-center px-1.5 py-0.5 rounded-full text-[11px] text-muted-foreground hover:text-foreground bg-secondary/40 border border-border"
            aria-label="Add reaction"
          >
            <Smile className="w-3 h-3" />
          </button>
        }
        onSelect={(emoji) => onToggle?.(messageId, emoji)}
      />
    </div>
  );
}
