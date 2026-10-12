/**
 * IndicatorLegend — top-left in-chart legend (MEXC-style) showing each active
 * indicator with a colour swatch, its label and current value (e.g.
 * "MA20  77,616.39"). Recomputes the latest value on every candle tick. Hover
 * a chip to remove that indicator.
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { INDICATORS } from "./indicators";

function fmt(v) {
  if (v == null || !Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

export default function IndicatorLegend({ indicators, onRemove, candlesRef, candlesVersion }) {
  const rows = useMemo(() => {
    const candles = candlesRef?.current || [];
    return (indicators || []).map((ind) => {
      const def = INDICATORS[ind.type];
      if (!def) return null;
      const lines = candles.length ? def.lines(candles, ind.params) : [];
      const primary = lines.find((l) => l.color === def.legendColor) || lines[0];
      const last = primary?.data?.[primary.data.length - 1];
      return {
        id: ind.id,
        label: def.summary ? def.summary(ind.params) : def.label,
        color: def.legendColor || "#94a3b8",
        value: last?.value,
      };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, candlesVersion]);

  if (rows.length === 0) return null;

  return (
    <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 pr-2 pointer-events-none">
      {rows.map((r) => (
        <span key={r.id} className="pointer-events-auto group inline-flex items-center gap-1 text-[11px] font-mono">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: r.color }} />
          <span className="text-muted-foreground">{r.label}</span>
          <span className="text-foreground/90">{fmt(r.value)}</span>
          <button
            type="button"
            onClick={() => onRemove(r.id)}
            aria-label="Remove indicator"
            className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
