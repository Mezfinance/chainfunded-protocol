/**
 * Market hours utility — determines if a market is open/closed and
 * calculates time until the next open/close.
 *
 * Boundaries are evaluated in America/New_York, not UTC. Every venue here
 * rolls at a fixed Eastern wall-clock time — the forex week, the CME Globex
 * session, the NYSE/NASDAQ bell — so a UTC constant is only correct for half
 * the year. This module previously used fixed UTC hours and consequently ran
 * an hour late through US daylight saving, which hid the first hour of the US
 * equity session and kept stocks "open" for an hour after the close.
 *
 *   - Crypto:      always open
 *   - Forex:       Sun 17:00 → Fri 17:00 ET
 *   - Commodities: Sun 18:00 → Fri 17:00 ET, daily break 17:00–18:00 ET
 *   - US Stocks:   Mon–Fri 09:30 → 16:00 ET
 *
 * Keep in sync with worker/marketHours.cjs, which additionally exposes
 * isQuoteExpected() for feed monitoring.
 */

import { ASSET_CLASS, MARKET_HOURS } from "./assetConfig";

// ── New York wall clock ───────────────────────────────────────────────────────

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** New York wall clock for an instant, as { day: 0-6, minutes: 0-1439 }. */
export function etNow(now = new Date()) {
  const parts = {};
  for (const p of ET_FORMAT.formatToParts(now)) parts[p.type] = p.value;
  // en-US with hour12:false renders midnight as "24" on some ICU builds.
  const hour = parseInt(parts.hour, 10) % 24;
  return {
    day: DAY_INDEX[parts.weekday],
    minutes: hour * 60 + parseInt(parts.minute, 10),
  };
}

// ── Open/closed predicates ────────────────────────────────────────────────────

function isFxOpen({ day, minutes }) {
  const h = MARKET_HOURS.FX;
  return !(
    (day === h.closeDay && minutes >= h.closeMinute) ||
    day === 6 ||
    (day === h.openDay && minutes < h.openMinute)
  );
}

function isCommoditiesOpen({ day, minutes }) {
  const h = MARKET_HOURS.COMMODITIES;
  const weekendClosed =
    (day === h.closeDay && minutes >= h.closeMinute) ||
    day === 6 ||
    (day === h.openDay && minutes < h.openMinute);
  if (weekendClosed) return false;
  if (day >= 1 && day <= 4 &&
      minutes >= h.dailyBreakStart && minutes < h.dailyBreakEnd) return false;
  return true;
}

function isStocksOpen({ day, minutes }) {
  const h = MARKET_HOURS.STOCKS;
  return day >= 1 && day <= 5 &&
         minutes >= h.openMinute && minutes < h.closeMinute;
}

function openAt(assetClass, at) {
  if (assetClass === ASSET_CLASS.CRYPTO || assetClass == null) return true;
  const et = etNow(at);
  if (assetClass === ASSET_CLASS.FX)          return isFxOpen(et);
  if (assetClass === ASSET_CLASS.COMMODITIES) return isCommoditiesOpen(et);
  if (assetClass === ASSET_CLASS.STOCKS)      return isStocksOpen(et);
  return true;
}

// ── Next state change ─────────────────────────────────────────────────────────
//
// Found by scanning forward rather than by arithmetic on a UTC boundary, so a
// DST shift inside the search window needs no special handling. Every boundary
// above falls on a quarter hour, so a 15-minute coarse pass cannot step over
// one; it is then refined to the exact minute. The result is memoised per
// (asset class, minute) because MarketStatusBar re-renders on a timer.

const COARSE_STEP_MIN = 15;
const HORIZON_MIN = 8 * 24 * 60; // longest closed stretch is a weekend
const flipCache = new Map();

function findNextFlip(assetClass, now, openNow) {
  const key = `${assetClass}:${Math.floor(now.getTime() / 60000)}:${openNow}`;
  if (flipCache.has(key)) return flipCache.get(key);

  let found = null;
  for (let m = COARSE_STEP_MIN; m <= HORIZON_MIN && found === null; m += COARSE_STEP_MIN) {
    if (openAt(assetClass, new Date(now.getTime() + m * 60000)) !== openNow) {
      for (let k = m - COARSE_STEP_MIN + 1; k <= m; k++) {
        const at = new Date(now.getTime() + k * 60000);
        if (openAt(assetClass, at) !== openNow) {
          at.setSeconds(0, 0);
          found = at;
          break;
        }
      }
    }
  }

  if (flipCache.size > 64) flipCache.clear();
  flipCache.set(key, found);
  return found;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current market status for a given asset class.
 *
 * @param {string} assetClass — one of ASSET_CLASS values
 * @param {Date}   [now]      — override for testing
 * @returns {{ isOpen: boolean, label: string, nextChange: Date|null, nextChangeLabel: string, description?: string }}
 */
export function getMarketStatus(assetClass, now = new Date()) {
  if (assetClass === ASSET_CLASS.CRYPTO) {
    return { isOpen: true, label: "24/7", nextChange: null, nextChangeLabel: "" };
  }

  const hours = getHoursConfig(assetClass);
  if (!hours) return { isOpen: true, label: "24/7", nextChange: null, nextChangeLabel: "" };

  const et = etNow(now);
  const isOpen = openAt(assetClass, now);
  const nextChange = findNextFlip(assetClass, now, isOpen);

  return {
    isOpen,
    label: isOpen ? "Open" : closedLabel(assetClass, et),
    nextChange,
    nextChangeLabel: isOpen ? "Closes" : "Opens",
    description: hours.description,
  };
}

function closedLabel(assetClass, { day, minutes }) {
  if (day === 6 || day === 0) {
    // Sunday evening after the forex/Globex open is handled by isOpen; getting
    // here on a Sunday means the week has not started yet.
    return assetClass === ASSET_CLASS.STOCKS ? "Weekend" : "Closed (Weekend)";
  }

  if (assetClass === ASSET_CLASS.COMMODITIES) {
    const h = MARKET_HOURS.COMMODITIES;
    if (day >= 1 && day <= 4 &&
        minutes >= h.dailyBreakStart && minutes < h.dailyBreakEnd) return "Daily Break";
    return "Closed";
  }

  if (assetClass === ASSET_CLASS.STOCKS) {
    return minutes < MARKET_HOURS.STOCKS.openMinute ? "Pre-Market" : "After Hours";
  }

  return "Closed";
}

function getHoursConfig(assetClass) {
  switch (assetClass) {
    case ASSET_CLASS.FX: return MARKET_HOURS.FX;
    case ASSET_CLASS.COMMODITIES: return MARKET_HOURS.COMMODITIES;
    case ASSET_CLASS.STOCKS: return MARKET_HOURS.STOCKS;
    default: return null;
  }
}

/**
 * Format a duration between now and a target date as a human-readable string.
 * e.g., "2h 15m", "1d 4h", "35m"
 */
export function formatTimeUntil(target, now = new Date()) {
  if (!target) return "";
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "now";

  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

/**
 * Hook-friendly: returns true if the given asset class market is currently open.
 */
export function isMarketOpen(assetClass, now = new Date()) {
  return openAt(assetClass, now);
}
