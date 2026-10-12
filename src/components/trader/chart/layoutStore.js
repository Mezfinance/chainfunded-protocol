/**
 * Named chart layouts — a saved snapshot of drawings + indicators + chart type
 * + scale mode, stored globally per wallet (not per symbol) so a setup can be
 * applied to any chart. Drawings are kept in data coords; applying a layout to
 * a different symbol places them at the saved prices (the user can adjust).
 *
 * @typedef {Object} ChartLayout
 * @property {string} name
 * @property {object[]} drawings
 * @property {{type:string, params:object}[]} indicators
 * @property {string} chartType
 * @property {string} scaleMode
 * @property {number} savedAt
 */
const KEY_PREFIX = "cf_chart_layouts";

function keyFor(wallet) {
  return `${KEY_PREFIX}:${(wallet || "anon").toLowerCase()}`;
}

/** @returns {ChartLayout[]} */
export function loadLayouts(wallet) {
  try {
    const raw = localStorage.getItem(keyFor(wallet));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLayouts(wallet, layouts) {
  try { localStorage.setItem(keyFor(wallet), JSON.stringify(layouts)); } catch { /* non-critical */ }
}

// Upsert by name (case-insensitive). Returns the new list.
export function saveLayout(wallet, layout) {
  const name = (layout.name || "").trim();
  if (!name) return loadLayouts(wallet);
  const list = loadLayouts(wallet).filter((l) => l.name.toLowerCase() !== name.toLowerCase());
  const next = [...list, { ...layout, name, savedAt: Date.now() }].sort((a, b) => a.name.localeCompare(b.name));
  writeLayouts(wallet, next);
  return next;
}

export function deleteLayout(wallet, name) {
  const next = loadLayouts(wallet).filter((l) => l.name !== name);
  writeLayouts(wallet, next);
  return next;
}
