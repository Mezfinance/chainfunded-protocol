/**
 * DrawingsPrimitive — a single Lightweight Charts v5 series primitive that
 * renders ALL chart drawings (and the in-progress draft) and answers hit-tests
 * for selection. Drawings are held in data coordinates (time + price) and
 * converted to pixels at draw time, so they track zoom/scroll/resize.
 *
 * Types: trendline, ray, horizontal, vertical, rectangle, position, fib, text,
 * channel (parallel), pitchfork, arrow, flag. New types plug into the render +
 * hit-test switches below.
 */
const HANDLE_R = 4;
const HIT_THRESHOLD = 6;
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Extend a ray from a through b to the canvas edge (t >= 1 keeps the b side).
function rayEnd(ax, ay, bx, by, W, H) {
  const dx = bx - ax;
  const dy = by - ay;
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (W - ax) / dx);
  else if (dx < 0) tMax = Math.min(tMax, (0 - ax) / dx);
  if (dy > 0) tMax = Math.min(tMax, (H - ay) / dy);
  else if (dy < 0) tMax = Math.min(tMax, (0 - ay) / dy);
  if (!Number.isFinite(tMax) || tMax < 1) tMax = 1;
  return { x: ax + dx * tMax, y: ay + dy * tMax };
}

class Renderer {
  constructor(state) { this._s = state; }
  draw(target) {
    const s = this._s;
    if (!s.series || !s.timeScale) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const W = scope.mediaSize.width;
      const H = scope.mediaSize.height;
      s.size = { width: W, height: H }; // cached for hit-testing full-span tools

      const xOf = (t) => s.timeScale.timeToCoordinate(t);
      const yOf = (p) => s.series.priceToCoordinate(p);
      const handle = (x, y, color) => {
        ctx.beginPath();
        ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      };

      const render = (d, selected) => {
        const color = d.style?.color || s.accent;
        const width = d.style?.width || 2;
        ctx.save();
        ctx.lineWidth = width;
        ctx.strokeStyle = color;

        if (d.type === "horizontal") {
          const y = yOf(d.points[0].price);
          if (y == null) { ctx.restore(); return; }
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          if (selected) { const x = xOf(d.points[0].time); handle(x == null ? W / 2 : x, y, color); }
        } else if (d.type === "vertical") {
          const x = xOf(d.points[0].time);
          if (x == null) { ctx.restore(); return; }
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
          if (selected) { const y = yOf(d.points[0].price); handle(x, y == null ? H / 2 : y, color); }
        } else if (d.type === "trendline" || d.type === "ray") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
          const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
          if (ax == null || ay == null || bx == null || by == null) { ctx.restore(); return; }
          const end = d.type === "ray" ? rayEnd(ax, ay, bx, by, W, H) : { x: bx, y: by };
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(end.x, end.y); ctx.stroke();
          if (selected) { handle(ax, ay, color); handle(bx, by, color); }
        } else if (d.type === "rectangle") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
          const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
          if (ax == null || ay == null || bx == null || by == null) { ctx.restore(); return; }
          const x = Math.min(ax, bx), y = Math.min(ay, by);
          const w = Math.abs(bx - ax), h = Math.abs(by - ay);
          ctx.globalAlpha = 0.08; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
          ctx.strokeRect(x, y, w, h);
          if (selected) { handle(ax, ay, color); handle(bx, by, color); }
        } else if (d.type === "position") {
          // points: [0]=entry, [1]=target, [2]=stop (all share the entry time)
          const x0 = xOf(d.points[0].time);
          const yE = yOf(d.points[0].price);
          const yT = yOf(d.points[1].price);
          const yS = yOf(d.points[2].price);
          if (x0 == null || yE == null || yT == null || yS == null) { ctx.restore(); return; }
          const x1 = Math.min(x0 + 140, W);
          const green = "#22c55e";
          const red = "#ef4444";
          // profit zone (entry→target) and risk zone (entry→stop)
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = green; ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
          ctx.fillStyle = red; ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
          ctx.globalAlpha = 1;
          const hline = (y, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); };
          hline(yE, "#94a3b8"); hline(yT, green); hline(yS, red);
          // R:R label
          const entry = d.points[0].price, target = d.points[1].price, stop = d.points[2].price;
          const reward = Math.abs(target - entry);
          const risk = Math.abs(entry - stop);
          const rr = risk > 0 ? reward / risk : 0;
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "10px ui-monospace, monospace";
          ctx.fillText(`RR ${rr.toFixed(2)}`, x0 + 4, Math.min(yT, yS) - 4);
          if (selected) { handle(x0, yE, "#94a3b8"); handle(x0, yT, green); handle(x0, yS, red); }
        } else if (d.type === "fib") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const x0 = xOf(d.points[0].time);
          const x1 = xOf(d.points[1].time);
          if (x0 == null || x1 == null) { ctx.restore(); return; }
          const xa = Math.min(x0, x1);
          const xb = Math.max(x0, x1);
          const p0 = d.points[0].price;
          const p1 = d.points[1].price;
          ctx.font = "10px ui-monospace, monospace";
          for (const r of FIB_LEVELS) {
            const y = yOf(p0 + r * (p1 - p0));
            if (y == null) continue;
            ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.strokeStyle = color;
            ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
            ctx.globalAlpha = 1; ctx.fillStyle = "#94a3b8";
            const price = p0 + r * (p1 - p0);
            ctx.fillText(`${r.toFixed(3)}  ${price >= 1000 ? price.toFixed(0) : price.toFixed(2)}`, xb + 4, y - 1);
          }
          if (selected) { handle(x0, yOf(p0), color); handle(x1, yOf(p1), color); }
        } else if (d.type === "channel") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
          const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
          if (ax == null || ay == null || bx == null || by == null) { ctx.restore(); return; }
          if (d.points.length >= 3) {
            const cx = xOf(d.points[2].time), cy = yOf(d.points[2].price);
            if (cx == null || cy == null) { ctx.restore(); return; }
            // The parallel line is the base segment translated to pass through p2.
            const ox = cx - ax, oy = cy - ay;
            ctx.globalAlpha = 0.08; ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
            ctx.lineTo(bx + ox, by + oy); ctx.lineTo(ax + ox, ay + oy);
            ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(bx + ox, by + oy); ctx.stroke();
            if (selected) { handle(ax, ay, color); handle(bx, by, color); handle(cx, cy, color); }
          } else {
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            if (selected) { handle(ax, ay, color); handle(bx, by, color); }
          }
        } else if (d.type === "pitchfork") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
          const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
          if (ax == null || ay == null || bx == null || by == null) { ctx.restore(); return; }
          if (d.points.length >= 3) {
            const cx = xOf(d.points[2].time), cy = yOf(d.points[2].price);
            if (cx == null || cy == null) { ctx.restore(); return; }
            // Median from pivot p0 through the midpoint of p1-p2; the two tines
            // run parallel to the median through p1 and p2.
            const mx = (bx + cx) / 2, my = (by + cy) / 2;
            const dirx = mx - ax, diry = my - ay;
            const medEnd = rayEnd(ax, ay, mx, my, W, H);
            const e1 = rayEnd(bx, by, bx + dirx, by + diry, W, H);
            const e2 = rayEnd(cx, cy, cx + dirx, cy + diry, W, H);
            ctx.globalAlpha = 0.06; ctx.fillStyle = color;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.lineTo(cx, cy);
            ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(medEnd.x, medEnd.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(e1.x, e1.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(e2.x, e2.y); ctx.stroke();
            if (selected) { handle(ax, ay, color); handle(bx, by, color); handle(cx, cy, color); }
          } else {
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            if (selected) { handle(ax, ay, color); handle(bx, by, color); }
          }
        } else if (d.type === "arrow") {
          if (d.points.length < 2) { ctx.restore(); return; }
          const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
          const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
          if (ax == null || ay == null || bx == null || by == null) { ctx.restore(); return; }
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          const ang = Math.atan2(by - ay, bx - ax);
          const hl = 10;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - hl * Math.cos(ang - Math.PI / 6), by - hl * Math.sin(ang - Math.PI / 6));
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - hl * Math.cos(ang + Math.PI / 6), by - hl * Math.sin(ang + Math.PI / 6));
          ctx.stroke();
          if (selected) { handle(ax, ay, color); handle(bx, by, color); }
        } else if (d.type === "flag") {
          const x = xOf(d.points[0].time);
          const y = yOf(d.points[0].price);
          if (x == null || y == null) { ctx.restore(); return; }
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y - 18); ctx.lineTo(x + 14, y - 14); ctx.lineTo(x, y - 10);
          ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
          if (selected) { handle(x, y, color); }
        } else if (d.type === "text") {
          const x = xOf(d.points[0].time);
          const y = yOf(d.points[0].price);
          if (x == null || y == null) { ctx.restore(); return; }
          ctx.font = "12px ui-monospace, monospace";
          ctx.fillStyle = d.style?.color || "#e2e8f0";
          ctx.fillText(d.text || "", x, y);
          if (selected) {
            const w = ctx.measureText(d.text || "").width;
            ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.strokeStyle = color;
            ctx.strokeRect(x - 2, y - 13, w + 4, 17);
            ctx.globalAlpha = 1;
            handle(x, y, color);
          }
        }
        ctx.restore();
      };

      for (const d of s.drawings) render(d, d.id === s.selectedId);
      if (s.draft?.points?.[0]) {
        if (s.draft.points.length >= 2 || s.draft.preview) {
          const pts = s.draft.preview ? [...s.draft.points, s.draft.preview] : s.draft.points;
          render({ ...s.draft, points: pts }, false);
        }
      }
    });
  }
}

class PaneView {
  constructor(primitive) { this._p = primitive; }
  renderer() { return new Renderer(this._p._state); }
  zOrder() { return "top"; }
}

export class DrawingsPrimitive {
  constructor() {
    this._state = {
      drawings: [], draft: null, selectedId: null,
      series: null, timeScale: null, accent: "#1a9e4a", size: { width: 0, height: 0 },
    };
    this._paneViews = [new PaneView(this)];
    this._requestUpdate = null;
  }
  attached({ chart, series, requestUpdate }) {
    this._requestUpdate = requestUpdate;
    this._state.series = series;
    this._state.timeScale = chart.timeScale();
  }
  detached() { this._requestUpdate = null; this._state.series = null; this._state.timeScale = null; }
  updateAllViews() {}
  paneViews() { return this._paneViews; }

  setState(patch) {
    Object.assign(this._state, patch);
    this._requestUpdate?.();
  }

  hitTest(x, y) {
    const s = this._state;
    if (!s.series || !s.timeScale) return null;
    const { width: W, height: H } = s.size;
    const xOf = (t) => s.timeScale.timeToCoordinate(t);
    const yOf = (p) => s.series.priceToCoordinate(p);

    let bestId = null;
    let bestDist = HIT_THRESHOLD;
    for (const d of s.drawings) {
      let dist = Infinity;
      if (d.type === "horizontal") {
        const ly = yOf(d.points[0].price);
        if (ly != null) dist = Math.abs(y - ly);
      } else if (d.type === "vertical") {
        const lx = xOf(d.points[0].time);
        if (lx != null) dist = Math.abs(x - lx);
      } else if (d.type === "trendline" || d.type === "ray") {
        const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
        const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
        if (ax != null && ay != null && bx != null && by != null) {
          const end = d.type === "ray" ? rayEnd(ax, ay, bx, by, W, H) : { x: bx, y: by };
          dist = distToSegment(x, y, ax, ay, end.x, end.y);
        }
      } else if (d.type === "rectangle") {
        const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
        const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
        if (ax != null && ay != null && bx != null && by != null) {
          const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
          const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
          const edges = [
            distToSegment(x, y, x0, y0, x1, y0),
            distToSegment(x, y, x1, y0, x1, y1),
            distToSegment(x, y, x1, y1, x0, y1),
            distToSegment(x, y, x0, y1, x0, y0),
          ];
          dist = Math.min(...edges);
        }
      } else if (d.type === "position") {
        const x0 = xOf(d.points[0].time);
        if (x0 != null) {
          const x1 = Math.min(x0 + 140, W);
          if (x >= x0 && x <= x1) {
            for (const p of d.points) {
              const ly = yOf(p.price);
              if (ly != null) dist = Math.min(dist, Math.abs(y - ly));
            }
          }
        }
      } else if (d.type === "fib") {
        const x0 = xOf(d.points[0].time);
        const x1 = xOf(d.points[1].time);
        if (x0 != null && x1 != null) {
          const xa = Math.min(x0, x1);
          const xb = Math.max(x0, x1);
          if (x >= xa - 2 && x <= xb + 2) {
            const p0 = d.points[0].price;
            const p1 = d.points[1].price;
            for (const r of FIB_LEVELS) {
              const ly = yOf(p0 + r * (p1 - p0));
              if (ly != null) dist = Math.min(dist, Math.abs(y - ly));
            }
          }
        }
      } else if (d.type === "channel") {
        const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
        const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
        if (ax != null && ay != null && bx != null && by != null) {
          dist = distToSegment(x, y, ax, ay, bx, by);
          if (d.points.length >= 3) {
            const cx = xOf(d.points[2].time), cy = yOf(d.points[2].price);
            if (cx != null && cy != null) {
              const ox = cx - ax, oy = cy - ay;
              dist = Math.min(dist, distToSegment(x, y, ax + ox, ay + oy, bx + ox, by + oy));
            }
          }
        }
      } else if (d.type === "pitchfork") {
        const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
        const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
        if (ax != null && ay != null && bx != null && by != null) {
          if (d.points.length >= 3) {
            const cx = xOf(d.points[2].time), cy = yOf(d.points[2].price);
            if (cx != null && cy != null) {
              const mx = (bx + cx) / 2, my = (by + cy) / 2;
              const dirx = mx - ax, diry = my - ay;
              const medEnd = rayEnd(ax, ay, mx, my, W, H);
              const e1 = rayEnd(bx, by, bx + dirx, by + diry, W, H);
              const e2 = rayEnd(cx, cy, cx + dirx, cy + diry, W, H);
              dist = Math.min(
                distToSegment(x, y, ax, ay, medEnd.x, medEnd.y),
                distToSegment(x, y, bx, by, e1.x, e1.y),
                distToSegment(x, y, cx, cy, e2.x, e2.y),
                distToSegment(x, y, bx, by, cx, cy),
              );
            }
          } else {
            dist = distToSegment(x, y, ax, ay, bx, by);
          }
        }
      } else if (d.type === "arrow") {
        const ax = xOf(d.points[0].time), ay = yOf(d.points[0].price);
        const bx = xOf(d.points[1].time), by = yOf(d.points[1].price);
        if (ax != null && ay != null && bx != null && by != null) dist = distToSegment(x, y, ax, ay, bx, by);
      } else if (d.type === "flag") {
        const fx = xOf(d.points[0].time), fy = yOf(d.points[0].price);
        if (fx != null && fy != null && x >= fx - 2 && x <= fx + 16 && y >= fy - 20 && y <= fy + 2) dist = 0;
      } else if (d.type === "text") {
        const tx = xOf(d.points[0].time);
        const ty = yOf(d.points[0].price);
        if (tx != null && ty != null) {
          const w = (d.text || "").length * 7;
          if (x >= tx - 2 && x <= tx + w + 2 && y >= ty - 15 && y <= ty + 4) dist = 0;
        }
      }
      if (dist <= bestDist) { bestDist = dist; bestId = d.id; }
    }
    return bestId ? { externalId: bestId, zOrder: "top", cursorStyle: "pointer" } : null;
  }
}
