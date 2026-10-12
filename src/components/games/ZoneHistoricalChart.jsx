import { useEffect, useRef, useState } from "react";
import { fetchCandles } from "@/lib/workerCandles";
import { formatUtcTime } from "@/lib/datetime";

const N_MINUTES = 20;            // visible window
const FETCH_BUFFER = 5;          // extra minutes to fetch (covers missing bars)
const REFRESH_MS = 60_000;       // re-fetch cadence — matches the 1m bar cadence

const UP = "#22e07a";
const DOWN = "#ff4d6d";

/**
 * ZoneHistoricalChart — slim 20-minute candle strip that sits above the
 * main Zone Trading chart. Same colour language as the main chart (green
 * up / red down with a soft glow), but stripped to the essentials: no
 * zone bands, no countdown, no overlays. The point is to give the trader
 * historical price context before they decide a direction.
 *
 * Data: Pyth Benchmarks 1-minute bars, refreshed every 60 seconds.
 * Renders the most recent N_MINUTES of bars and auto-rescales y.
 */
export default function ZoneHistoricalChart({ symbol, displaySymbol }) {
  const canvasRef = useRef(null);
  const [candles, setCandles] = useState([]);
  const [error, setError] = useState(null);
  // { idx, x } — null when not hovering a candle. `x` is the candle centre in
  // CSS pixels; the tooltip is positioned in screen space by the wrapper.
  const [hover, setHover] = useState(null);

  // Fetch + refresh loop
  useEffect(() => {
    const sym = displaySymbol || symbol;
    if (!sym) { setCandles([]); return undefined; }
    let cancelled = false;

    async function fetchHistory() {
      try {
        const rows = await fetchCandles(sym, "1m", N_MINUTES + FETCH_BUFFER);
        if (!rows.length) { if (!cancelled) setCandles([]); return; }
        const out = rows
          .filter((c) => Number.isFinite(c.close))
          .map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close }));
        if (!cancelled) {
          setCandles(out.slice(-N_MINUTES));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "fetch failed");
      }
    }
    fetchHistory();
    const id = setInterval(fetchHistory, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol, displaySymbol]);

  // Draw to canvas whenever the candle data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 110;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, "#0a0f12");
    bg.addColorStop(1, "#0d1418");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    if (!candles.length) {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Loading 20-min history…", cssW / 2, cssH / 2);
      return;
    }

    const padT = 8, padB = 8, padL = 6, padR = 56;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    let lo = Infinity, hi = -Infinity;
    for (const c of candles) {
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    }
    const span = hi - lo || hi * 0.001 || 1;
    lo -= span * 0.08; hi += span * 0.08;
    const y = (p) => padT + ((hi - p) / (hi - lo)) * plotH;
    const fmt = (p) => p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);

    // Right-edge price labels (current + range)
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(148,163,184,0.45)";
    ctx.textAlign = "left";
    ctx.fillText(fmt(hi), padL + plotW + 6, padT + 8);
    ctx.fillText(fmt(lo), padL + plotW + 6, padT + plotH - 2);

    // Candles
    const n = candles.length;
    const slot = plotW / N_MINUTES;
    const cw = Math.max(2, slot * 0.62);
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const x = padL + (N_MINUTES - n + i) * slot + slot / 2;
      const up = c.c >= c.o;
      const color = up ? UP : DOWN;
      const isLast = i === n - 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isLast ? 8 : 6;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
      const yo = y(c.o), yc = y(c.c);
      ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(2, Math.abs(yc - yo)));
    }
    ctx.shadowBlur = 0;

    // Latest close — right-edge tag
    const lastClose = candles[n - 1].c;
    const lastUp = candles[n - 1].c >= candles[n - 1].o;
    const ly = y(lastClose);
    ctx.fillStyle = lastUp ? UP : DOWN;
    ctx.fillRect(padL + plotW, ly - 7, padR - 4, 14);
    ctx.fillStyle = "#0a0f12";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText(fmt(lastClose), padL + plotW + 4, ly + 3);

    // Hover highlight: vertical guide line under the cursor's candle.
    if (hover && hover.idx >= 0 && hover.idx < n) {
      const hx = padL + (N_MINUTES - n + hover.idx) * slot + slot / 2;
      ctx.strokeStyle = "rgba(226,232,240,0.45)";
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, hover]);

  // Convert a pointer x position (CSS pixels) → candle index, or null when the
  // pointer is outside the plot area / past the last candle.
  function handlePointer(e) {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) { setHover(null); return; }
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const padT = 8, padB = 8, padL = 6, padR = 56;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    if (px < padL || px > padL + plotW || py < padT || py > padT + plotH) {
      setHover(null);
      return;
    }
    const n = candles.length;
    const slot = plotW / N_MINUTES;
    // Slots are right-aligned (oldest sits in slot `N_MINUTES - n`).
    const slotIdx = Math.floor((px - padL) / slot);
    const idx = slotIdx - (N_MINUTES - n);
    if (idx < 0 || idx >= n) { setHover(null); return; }
    const x = padL + slotIdx * slot + slot / 2;
    setHover({ idx, x });
  }

  const sym = displaySymbol || symbol;
  const hoverCandle = hover && candles[hover.idx];
  const fmtPrice = (p) => p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);
  const fmtTime = (t) => formatUtcTime(t);
  return (
    <div className="rounded-xl border border-border bg-[#0a0f12] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="font-grotesk text-xs font-semibold text-foreground">{sym}</span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {error ? "history unavailable" : "last 20m · 1m · updates each minute"}
        </span>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block w-full h-[110px] sm:h-[120px]"
          onMouseMove={handlePointer}
          onMouseLeave={() => setHover(null)}
        />
        {hoverCandle && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border/70 bg-[#0a0f12]/95 px-2 py-1.5 font-mono text-[10px] leading-tight text-foreground shadow-lg backdrop-blur-sm"
            style={{
              left: `min(calc(100% - 132px), max(4px, ${hover.x + 10}px))`,
              top: 6,
              minWidth: 124,
            }}
          >
            <div className="text-muted-foreground tracking-wider uppercase text-[9px]">{fmtTime(hoverCandle.t)}</div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-2 tabular-nums">
              <span className="text-muted-foreground">O</span><span>{fmtPrice(hoverCandle.o)}</span>
              <span className="text-muted-foreground">H</span><span className="text-[color:var(--up,#22e07a)]" style={{ color: UP }}>{fmtPrice(hoverCandle.h)}</span>
              <span className="text-muted-foreground">L</span><span style={{ color: DOWN }}>{fmtPrice(hoverCandle.l)}</span>
              <span className="text-muted-foreground">C</span>
              <span style={{ color: hoverCandle.c >= hoverCandle.o ? UP : DOWN }}>{fmtPrice(hoverCandle.c)}</span>
            </div>
            <div className="mt-1 border-t border-border/40 pt-0.5 text-muted-foreground tabular-nums">
              Δ {((hoverCandle.c - hoverCandle.o) / hoverCandle.o * 100).toFixed(3)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
