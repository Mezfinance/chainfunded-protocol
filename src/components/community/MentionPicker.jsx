import { useEffect, useRef, useState } from "react";
import { communityApi } from "@/lib/communityApi";

/**
 * Autocomplete dropdown for @handle mentions.
 *
 * Props:
 *   - prefix: substring after the active "@" (without the "@")
 *   - onPick(handle): replace the active token with @handle
 *   - onClose(): cancel the picker
 *
 * Renders nothing when prefix is empty or no matches. Position is
 * controlled by the parent — wraps in a relative-positioned wrapper.
 */
export default function MentionPicker({ prefix, onPick, onClose }) {
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!prefix) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { handles } = await communityApi.searchHandles(prefix);
        setResults(Array.isArray(handles) ? handles : []);
        setActive(0);
      } catch {
        setResults([]);
      }
    }, 100);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [prefix]);

  // Keyboard navigation — parent installs the listener via a ref on the
  // textarea; we handle Enter / ArrowUp / ArrowDown / Tab / Escape here
  // when picker is open.
  useEffect(() => {
    const onKey = (e) => {
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + results.length) % results.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = results[active];
        if (pick) onPick?.(pick.handle);
      } else if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [results, active, onPick, onClose]);

  if (!prefix || results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-2 mb-1 z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden min-w-[180px]">
      {results.map((r, i) => (
        <button
          key={r.handle}
          onMouseDown={(e) => { e.preventDefault(); onPick?.(r.handle); }}
          onMouseEnter={() => setActive(i)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
            i === active
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-secondary/50"
          }`}
        >
          @{r.handle}
        </button>
      ))}
    </div>
  );
}
