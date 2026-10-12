/**
 * Active-indicator persistence — per wallet+symbol, localStorage. Mirrors
 * drawingStore. Each entry: { id, type, params }.
 */
const KEY_PREFIX = "cf_chart_indicators";

function keyFor(wallet, symbol) {
  return `${KEY_PREFIX}:${(wallet || "anon").toLowerCase()}:${symbol}`;
}

export function loadIndicators(wallet, symbol) {
  if (!symbol) return [];
  try {
    const raw = localStorage.getItem(keyFor(wallet, symbol));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveIndicators(wallet, symbol, indicators) {
  if (!symbol) return;
  try {
    localStorage.setItem(keyFor(wallet, symbol), JSON.stringify(indicators || []));
  } catch {
    /* non-critical */
  }
}

export function newIndicatorId() {
  return `ind_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
