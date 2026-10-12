/**
 * InfoHint — a small "ⓘ" affordance that reveals help text. Uses a Popover
 * (click/tap to open) rather than a hover tooltip so it works on touch
 * devices, where hover tooltips never open. Stops click propagation so it
 * can live inside clickable rows/cards without triggering them.
 */
import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export default function InfoHint({ text, side = "top", className = "" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          aria-label="More info"
          className={`inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className}`}
        >
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        onClick={(e) => e.stopPropagation()}
        className="w-auto max-w-[220px] text-center text-xs p-2 leading-snug"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
