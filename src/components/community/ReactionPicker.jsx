import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { EMOJI_CATEGORIES } from "@/lib/communityEmojis";

/**
 * Emoji popover. Vertical category tabs on the left, scrollable grid on
 * the right. Sized for both desktop and mobile (uses Popover; on mobile
 * Radix renders centred / anchored, which is good enough for v1).
 */
export default function ReactionPicker({ trigger, onSelect }) {
  const [activeCat, setActiveCat] = useState(0);
  const [open, setOpen] = useState(false);
  const cat = EMOJI_CATEGORIES[activeCat];

  const handlePick = (emoji) => {
    onSelect?.(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-0 border border-border bg-popover"
      >
        <div className="flex">
          <div className="w-16 shrink-0 border-r border-border py-1.5 space-y-0.5 max-h-72 overflow-y-auto">
            {EMOJI_CATEGORIES.map((c, i) => (
              <button
                key={c.name}
                onClick={() => setActiveCat(i)}
                className={`w-full px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                  i === activeCat
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="flex-1 max-h-72 overflow-y-auto p-2">
            <div className="grid grid-cols-7 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handlePick(emoji)}
                  className="aspect-square rounded hover:bg-secondary/60 text-xl leading-none flex items-center justify-center transition-colors"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
