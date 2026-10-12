/**
 * IndicatorMenu — the "Indicators" toolbar button + popover. Add overlay
 * indicators, tweak their periods, or remove them. Opened from the chart's
 * top toolbar next to "Tools".
 */
import { LineChart, Plus, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { INDICATOR_LIST, INDICATORS } from "./indicators";

export default function IndicatorMenu({ indicators, addIndicator, removeIndicator, updateIndicator, hasVolume = true }) {
  const count = indicators.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Indicators"
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded font-medium transition-colors ${
            count ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LineChart className="w-3.5 h-3.5" /> Indicators{count ? ` (${count})` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 text-xs">
        <div className="font-semibold text-foreground mb-1">Add indicator</div>
        <div className="flex flex-col gap-0.5 mb-1">
          {INDICATOR_LIST.map(({ type, label }) => {
            const added = !INDICATORS[type].allowMultiple && indicators.some((i) => i.type === type);
            const noVolume = type === "volume" && !hasVolume;
            const disabled = added || noVolume;
            return (
              <button
                key={type}
                type="button"
                onClick={() => addIndicator(type)}
                disabled={disabled}
                title={noVolume ? "No volume data for this symbol" : added ? "Already added" : undefined}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary text-left text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Plus className="w-3 h-3 text-primary shrink-0" /> {label}
                {added && <span className="ml-auto text-[10px] text-muted-foreground">added</span>}
                {noVolume && <span className="ml-auto text-[10px] text-muted-foreground">n/a</span>}
              </button>
            );
          })}
        </div>

        {count > 0 && (
          <div className="border-t border-border pt-2 mt-1">
            <div className="font-semibold text-foreground mb-1.5">Active</div>
            <div className="flex flex-col gap-1.5">
              {indicators.map((ind) => {
                const def = INDICATORS[ind.type];
                return (
                  <div key={ind.id} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground flex-1 truncate">{def?.label}</span>
                    {ind.params.period != null && (
                      <input
                        type="number" min="1" value={ind.params.period}
                        onChange={(e) => updateIndicator(ind.id, { period: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        title="Period"
                        className="w-12 bg-secondary border border-border rounded px-1 py-0.5 text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                    {ind.type === "bb" && (
                      <input
                        type="number" min="0.5" step="0.5" value={ind.params.mult}
                        onChange={(e) => updateIndicator(ind.id, { mult: parseFloat(e.target.value) || 2 })}
                        title="StdDev multiplier"
                        className="w-12 bg-secondary border border-border rounded px-1 py-0.5 text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeIndicator(ind.id)}
                      aria-label="Remove indicator"
                      className="text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
