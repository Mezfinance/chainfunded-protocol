/**
 * Chart drawing persistence — foundation for the in-house drawing tools
 * (see docs/charting-scope.md). Drawings are stored per wallet+symbol in
 * localStorage, in DATA coordinates (time + price) so they survive zoom,
 * scroll and resize. A wallet-synced backend can replace localStorage later
 * without changing this contract.
 *
 * @typedef {Object} DrawingPoint
 * @property {number} time   unix seconds (chart time coordinate)
 * @property {number} price
 *
 * @typedef {Object} Drawing
 * @property {string} id
 * @property {"trendline"|"horizontal"|"vertical"|"ray"|"rectangle"|"text"|"fib"|"position"} type
 * @property {DrawingPoint[]} points   anchor points in data coordinates
 * @property {Object} [style]          { color, width, lineStyle, ... }
 * @property {string} [text]           for text / callout tools
 * @property {number} createdAt
 */

const KEY_PREFIX = "cf_chart_drawings";

function keyFor(wallet, symbol) {
  return `${KEY_PREFIX}:${(wallet || "anon").toLowerCase()}:${symbol}`;
}

/** @returns {Drawing[]} */
export function loadDrawings(wallet, symbol) {
  if (!symbol) return [];
  try {
    const raw = localStorage.getItem(keyFor(wallet, symbol));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveDrawings(wallet, symbol, drawings) {
  if (!symbol) return;
  try {
    localStorage.setItem(keyFor(wallet, symbol), JSON.stringify(drawings || []));
  } catch {
    /* quota exceeded / unavailable — non-critical */
  }
}

export function addDrawing(wallet, symbol, drawing) {
  const next = [...loadDrawings(wallet, symbol), drawing];
  saveDrawings(wallet, symbol, next);
  return next;
}

export function updateDrawing(wallet, symbol, id, patch) {
  const next = loadDrawings(wallet, symbol).map((d) => (d.id === id ? { ...d, ...patch } : d));
  saveDrawings(wallet, symbol, next);
  return next;
}

export function removeDrawing(wallet, symbol, id) {
  const next = loadDrawings(wallet, symbol).filter((d) => d.id !== id);
  saveDrawings(wallet, symbol, next);
  return next;
}

export function newDrawingId() {
  return `dw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
