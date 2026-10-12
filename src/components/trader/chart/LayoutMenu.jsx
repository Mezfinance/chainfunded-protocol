/**
 * LayoutMenu — save the current chart setup (drawings + indicators + chart type
 * + scale) as a named layout, and apply/delete saved layouts. Opened from the
 * chart toolbar. Layouts are global per wallet, so a setup applies to any chart.
 */
import { useState } from "react";
import { Save, Check, Trash2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { loadLayouts, saveLayout, deleteLayout } from "./layoutStore";

export default function LayoutMenu({ wallet, getCurrent, onApply }) {
  const [layouts, setLayouts] = useState(() => loadLayouts(wallet));
  const [name, setName] = useState("");

  const refresh = () => setLayouts(loadLayouts(wallet));

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    setLayouts(saveLayout(wallet, { name: n, ...getCurrent() }));
    setName("");
  };

  return (
    <Popover onOpenChange={(o) => o && refresh()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Layouts"
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Layouts
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 text-xs">
        <div className="font-semibold text-foreground mb-1.5">Save current layout</div>
        <div className="flex items-center gap-1 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="Layout name…"
            className="flex-1 bg-secondary border border-border rounded px-1.5 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-2 py-1 rounded bg-primary text-primary-foreground font-medium disabled:opacity-40"
          >
            Save
          </button>
        </div>

        {layouts.length > 0 ? (
          <div className="border-t border-border pt-2">
            <div className="font-semibold text-foreground mb-1">Saved</div>
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {layouts.map((l) => (
                <div key={l.name} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onApply(l)}
                    className="flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary text-left text-foreground"
                    title="Apply layout"
                  >
                    <Check className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate">{l.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/70 shrink-0">
                      {(l.indicators?.length || 0)}i · {(l.drawings?.length || 0)}d
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { deleteLayout(wallet, l.name); refresh(); }}
                    aria-label="Delete layout"
                    className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-red-400 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground border-t border-border pt-2">No saved layouts yet.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
