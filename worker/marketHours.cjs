"use strict";

/**
 * worker/marketHours.cjs
 *
 * CommonJS port of src/lib/marketHours.js — slim version with just what
 * the worker needs: asset-class detection from a trade symbol, an
 * isMarketOpen(assetClass, now) check, and isQuoteExpected() for monitoring.
 *
 * Keep in sync with src/lib/marketHours.js + the MARKET_HOURS constants
 * in src/lib/assetConfig.js.
 *
 * ── Why these boundaries are expressed in New York time ────────────────────
 * Every venue we track runs on US Eastern: the forex week, the CME Globex
 * session and the NYSE/NASDAQ session all roll at a fixed *Eastern* wall-clock
 * time, which means their UTC offset moves by an hour twice a year with US
 * daylight saving.
 *
 * This file used to hold them as fixed UTC hours ("openHour: 22, // = 5:00 PM
 * ET"), which is only true from November to March. Through the summer every
 * boundary was an hour late, which (a) kept US stocks "open" for an hour after
 * the 16:00 ET bell and hid the first hour of the real session, and (b) put the
 * commodities maintenance break on the wrong hour. Boundaries are now derived
 * from America/New_York, so DST is handled for us.
 */

const {
  CRYPTO_ASSETS,
  FX_ASSETS,
  COMMODITY_ASSETS,
  STOCK_ASSETS,
} = require("./assetConfig.cjs");

const ASSET_CLASS = {
  CRYPTO:      "crypto",
  FX:          "fx",
  COMMODITIES: "commodities",
  STOCKS:      "stocks",
};

// All boundaries below are minutes-from-midnight in America/New_York.
const MARKET_HOURS = {
  CRYPTO: null, // 24/7

  FX: {
    label: "Forex Market",
    openDay: 0, openMinute: 17 * 60,   // Sun 17:00 ET
    closeDay: 5, closeMinute: 17 * 60, // Fri 17:00 ET
    description: "Sun 17:00 – Fri 17:00 ET",
  },

  COMMODITIES: {
    label: "CME Globex",
    openDay: 0, openMinute: 18 * 60,   // Sun 18:00 ET
    closeDay: 5, closeMinute: 17 * 60, // Fri 17:00 ET
    dailyBreakStart: 17 * 60,          // 17:00 ET
    dailyBreakEnd:   18 * 60,          // 18:00 ET
    description: "Sun 18:00 – Fri 17:00 ET (break 17:00–18:00)",
  },

  STOCKS: {
    label: "NYSE / NASDAQ",
    weekdaysOnly: true,
    openMinute:  9 * 60 + 30, // 09:30 ET
    closeMinute: 16 * 60,     // 16:00 ET
    description: "Mon–Fri 09:30 – 16:00 ET",
  },
};

/**
 * Daily forex rollover. At 17:00 ET the interbank day rolls over and brokers
 * stop quoting FX for a few minutes. The market has not closed — positions
 * stay open and nothing is settled — so this is deliberately NOT part of
 * isMarketOpen(). It only tells the monitors that silence is expected.
 *
 * Observed in production: the eToro feed goes quiet from 17:00 ET for roughly
 * two to five minutes. Because US stocks have just closed and commodities are
 * in their own 17:00–18:00 ET halt at the same moment, FX is the only thing
 * left keeping the eToro connection visibly alive, so the whole source looked
 * dead and paged every weekday at 17:01 ET.
 */
const FX_ROLLOVER_GAP_MINUTES =
  Number(process.env.WORKER_FX_ROLLOVER_GAP_MINUTES) || 15;

// Build symbol → asset class map from the worker's existing asset arrays.
// Both "BTC/USDT" and "BTCUSDT" forms map to the same class to match the
// frontend's mixed usage.
const _classBySymbol = new Map();
function _addAssets(assets, klass) {
  for (const a of assets) {
    _classBySymbol.set(a.symbol, klass);
    _classBySymbol.set(a.symbol.replace(/USDT$/, "/USDT"), klass);
    _classBySymbol.set(a.symbol.replace("/", ""), klass);
  }
}
_addAssets(CRYPTO_ASSETS,    ASSET_CLASS.CRYPTO);
_addAssets(FX_ASSETS,        ASSET_CLASS.FX);
_addAssets(COMMODITY_ASSETS, ASSET_CLASS.COMMODITIES);
_addAssets(STOCK_ASSETS,     ASSET_CLASS.STOCKS);

function getAssetClass(symbol) {
  if (!symbol) return null;
  return _classBySymbol.get(symbol) ?? null;
}

// ── New York wall clock ─────────────────────────────────────────────────────

const _ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const _DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Current New York wall clock as { day: 0-6, minutes: 0-1439 }.
 * @param {Date} now
 */
function etNow(now) {
  const parts = {};
  for (const p of _ET_FORMAT.formatToParts(now)) parts[p.type] = p.value;
  // en-US with hour12:false renders midnight as "24" on some ICU builds.
  const hour = parseInt(parts.hour, 10) % 24;
  return {
    day: _DAY_INDEX[parts.weekday],
    minutes: hour * 60 + parseInt(parts.minute, 10),
  };
}

// ── Session checks ──────────────────────────────────────────────────────────

function isMarketOpen(assetClass, now = new Date()) {
  if (assetClass === ASSET_CLASS.CRYPTO || assetClass == null) return true;
  const et = etNow(now);
  if (assetClass === ASSET_CLASS.FX)          return _isFxOpen(et);
  if (assetClass === ASSET_CLASS.COMMODITIES) return _isCommoditiesOpen(et);
  if (assetClass === ASSET_CLASS.STOCKS)      return _isStocksOpen(et);
  return true;
}

/**
 * Whether a provider should be publishing ticks for this asset class right
 * now. Stricter than isMarketOpen(): it also excludes the intra-session gaps
 * during which a venue legitimately stops quoting without closing.
 *
 * Use this for liveness monitoring and reconnect watchdogs. Use isMarketOpen()
 * for anything that affects a trader's position.
 */
function isQuoteExpected(assetClass, now = new Date()) {
  if (!isMarketOpen(assetClass, now)) return false;
  if (assetClass !== ASSET_CLASS.FX) return true;
  const { day, minutes } = etNow(now);
  // Mon–Thu only: Friday 17:00 ET is the weekly close, already handled above,
  // and Sunday 17:00 ET is the weekly open rather than a rollover.
  if (day < 1 || day > 4) return true;
  const start = MARKET_HOURS.FX.closeMinute; // 17:00 ET
  return !(minutes >= start && minutes < start + FX_ROLLOVER_GAP_MINUTES);
}

function _isFxOpen({ day, minutes }) {
  const h = MARKET_HOURS.FX;
  const closed =
    (day === h.closeDay && minutes >= h.closeMinute) ||
    day === 6 ||
    (day === h.openDay && minutes < h.openMinute);
  return !closed;
}

function _isCommoditiesOpen({ day, minutes }) {
  const h = MARKET_HOURS.COMMODITIES;
  const weekendClosed =
    (day === h.closeDay && minutes >= h.closeMinute) ||
    day === 6 ||
    (day === h.openDay && minutes < h.openMinute);
  if (weekendClosed) return false;
  // Daily maintenance break 17:00–18:00 ET, Mon–Thu.
  if (day >= 1 && day <= 4 &&
      minutes >= h.dailyBreakStart && minutes < h.dailyBreakEnd) return false;
  return true;
}

function _isStocksOpen({ day, minutes }) {
  const h = MARKET_HOURS.STOCKS;
  return day >= 1 && day <= 5 &&
         minutes >= h.openMinute && minutes < h.closeMinute;
}

module.exports = {
  ASSET_CLASS,
  MARKET_HOURS,
  getAssetClass,
  isMarketOpen,
  isQuoteExpected,
  etNow,
};
