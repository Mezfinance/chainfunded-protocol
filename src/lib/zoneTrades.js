// Zone Trading client helpers — thin wrappers over the worker API plus a
// pure mirror of the server-side zone classifier (for the live HUD / chart).
// The worker is the authoritative source for placement, settlement, and
// exit valuation; this mirror only needs to agree on classification so the
// UI doesn't lie between ticks.

import { workerPost } from "@/lib/workerApi";
import { getAssetConfig } from "@/lib/assetConfig";
import FV_TABLE from "@/lib/zoneFairValueTable.json";

const SECONDS_PER_YEAR = 365 * 24 * 3600;
const DEFAULT_ANN_VOL = 0.30;

// ── Fair-value buyout (mirror of worker/zoneFairValue.js) ───────────────────
// V(z*, τ) is the expected hold-to-expiry payoff at the current state under
// sticky-KO. The table is dimensionless (z* in σ-units, τ as window fraction),
// so one static lookup serves every asset class × duration. The HUD reads
// this so the live "exit value" matches what the worker will pay on /zone/exit.
const FV = {
  k1: FV_TABLE.k1, k2: FV_TABLE.k2, pay: FV_TABLE.pay,
  zGrid: FV_TABLE.zGrid, tauGrid: FV_TABLE.tauGrid, V: FV_TABLE.V,
  defaultMargin: FV_TABLE.exitMargin,
};
const FV_ZMIN = FV.zGrid[0], FV_ZMAX = FV.zGrid[FV.zGrid.length - 1];
const FV_TMIN = FV.tauGrid[0], FV_TMAX = FV.tauGrid[FV.tauGrid.length - 1];

function terminalZonePay(z) {
  const a = Math.abs(z);
  if (a >= FV.k2) return z > 0 ? FV.pay.koWin   : -FV.pay.koLoss;
  if (a >= FV.k1) return z > 0 ? FV.pay.midWin  : -FV.pay.midLoss;
  return         z > 0 ? FV.pay.nearWin : (z < 0 ? -FV.pay.nearLoss : 0);
}

function fairValueAt(z, tau) {
  if (z >=  FV.k2) return  FV.pay.koWin;
  if (z <= -FV.k2) return -FV.pay.koLoss;
  if (tau <= 0)    return terminalZonePay(z);

  // Sub-grid τ → blend to terminal payoff
  if (tau < FV_TMIN) {
    const vEdge = fairValueAt(z, FV_TMIN);
    const term  = terminalZonePay(z);
    const t     = tau / FV_TMIN;
    return t * vEdge + (1 - t) * term;
  }
  // Beyond-grid |z| (between Z_MAX and k2) → blend to KO
  if (z > FV_ZMAX) {
    const vEdge = fairValueAt(FV_ZMAX, tau);
    const w     = (z - FV_ZMAX) / (FV.k2 - FV_ZMAX);
    return (1 - w) * vEdge + w * FV.pay.koWin;
  }
  if (z < -FV_ZMAX) {
    const vEdge = fairValueAt(-FV_ZMAX, tau);
    const w     = (-z - FV_ZMAX) / (FV.k2 - FV_ZMAX);
    return (1 - w) * vEdge + w * (-FV.pay.koLoss);
  }

  const tauC = Math.max(FV_TMIN, Math.min(FV_TMAX, tau));
  const zC   = Math.max(FV_ZMIN, Math.min(FV_ZMAX, z));
  let τLo = FV.tauGrid[0], τHi = FV.tauGrid[1];
  for (let i = 0; i < FV.tauGrid.length - 1; i++) {
    if (FV.tauGrid[i] <= tauC && tauC <= FV.tauGrid[i + 1]) { τLo = FV.tauGrid[i]; τHi = FV.tauGrid[i + 1]; break; }
  }
  let zLo = FV.zGrid[0], zHi = FV.zGrid[1];
  for (let i = 0; i < FV.zGrid.length - 1; i++) {
    if (FV.zGrid[i] <= zC && zC <= FV.zGrid[i + 1]) { zLo = FV.zGrid[i]; zHi = FV.zGrid[i + 1]; break; }
  }
  const t = τHi === τLo ? 0 : (tauC - τLo) / (τHi - τLo);
  const u = zHi === zLo ? 0 : (zC - zLo) / (zHi - zLo);
  const key = (n) => n.toFixed(2);
  const v00 = FV.V[key(τLo)][key(zLo)];
  const v01 = FV.V[key(τLo)][key(zHi)];
  const v10 = FV.V[key(τHi)][key(zLo)];
  const v11 = FV.V[key(τHi)][key(zHi)];
  return (1 - t) * (1 - u) * v00 + (1 - t) * u * v01
       + t       * (1 - u) * v10 + t       * u * v11;
}

// Fair-value buyout for an active bet at `livePrice`. Mirror of the worker's
// buyout(). Returns { pnl, zone, fav, fairValueFrac, tauRemain, tauEff, z }.
export function zoneBuyout(bet, livePrice, config) {
  const empty = { pnl: 0, zone: "flat", fav: 0, fairValueFrac: 0, tauRemain: 0, tauEff: 0, z: 0 };
  if (!bet || livePrice == null) return empty;
  const stake = +bet.stake;
  const entry = +bet.strike_price;
  if (!entry || !stake) return empty;

  const dir = bet.direction === "up" ? 1 : -1;
  const fav = dir * (livePrice - entry) / entry;
  const t2 = bet.t2_pct != null ? +bet.t2_pct : null;
  const sigmaPlacement = t2 != null && FV.k2 > 0 ? t2 / FV.k2 : 0;
  const z = sigmaPlacement > 0 ? fav / sigmaPlacement : 0;

  const settleMs = new Date(bet.settle_at).getTime();
  const lockMs   = new Date(bet.lock_at).getTime();
  const totalMs  = Math.max(1, settleMs - lockMs);
  const tauRemain = Math.max(0, Math.min(1, (settleMs - Date.now()) / totalMs));

  // Vol-regime adjustment: scale τ by (σ_now / σ_placement)² so the buyout
  // reflects current EWMA-derived vol, not the σ frozen at placement. The
  // live σ comes from config.zone.annVolByPair, which the worker rebuilds
  // each config poll from its EWMA tracker. Mirrors worker/zoneFairValue.js.
  let tauEff = tauRemain;
  const liveAnnVol = annVolFor(bet.symbol, config);
  if (liveAnnVol > 0 && sigmaPlacement > 0 && totalMs > 0) {
    const durSec = totalMs / 1000;
    const sigmaNow = liveAnnVol * Math.sqrt(durSec / SECONDS_PER_YEAR);
    const ratio = sigmaNow / sigmaPlacement;
    if (Number.isFinite(ratio) && ratio > 0) {
      tauEff = Math.max(0, Math.min(1, tauRemain * ratio * ratio));
    }
  }

  const a = Math.abs(z);
  const zone = a >= FV.k2 ? "far" : a >= FV.k1 ? "mid" : "near";
  const margin = config?.zone?.exitMargin ?? FV.defaultMargin ?? 0.05;
  const v = fairValueAt(z, tauEff);
  // Margin is a SPREAD: always shrinks payoff toward worse for the trader
  // (haircut on profit, surcharge on loss). Was `v * (1 - margin)` which
  // wrong-direction rebated losses.
  const fairValueFrac = v - margin * Math.abs(v);
  return { pnl: stake * fairValueFrac, zone, fav, fairValueFrac, tauRemain, tauEff, z };
}

// ── API wrappers ────────────────────────────────────────────────────────────
export async function fetchZoneConfig(address, symbol) {
  // `symbol` tells the worker which pair the user is viewing so it can warm
  // that one σ on demand instead of pre-fetching all 66 calibrated pairs
  // (which would 429 us off Pyth). Optional — config still works without it,
  // just falls back to static per-pair calibration values for prospective
  // bands.
  const payload = {};
  if (address) payload.address = address;
  if (symbol)  payload.symbol  = symbol;
  const res = await workerPost("/zone/config", payload);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Worker error ${res.status}`);
  return body; // { enabled, allowed, durationMs, durations, zone:{k1,k2,pay,annVolByClass}, ... }
}

export async function placeZoneTrade({ account_id, api_secret, symbol, direction, stake, duration_sec }) {
  const res = await workerPost("/zone/bet", { account_id, api_secret, symbol, direction, stake, duration_sec });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Worker error ${res.status}`);
  return body;
}

export async function fetchZoneHistory({ account_id, api_secret, limit = 50 }) {
  const res = await workerPost("/zone/history", { account_id, api_secret, limit });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Worker error ${res.status}`);
  return body; // { bets: [...], reserved: number }
}

export async function exitZoneTrade({ account_id, api_secret, bet_id }) {
  const res = await workerPost("/zone/exit", { account_id, api_secret, bet_id });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Worker error ${res.status}`);
  return body;
}

// ── Zone model ──────────────────────────────────────────────────────────────
function durationSecOf(bet) {
  if (!bet?.settle_at || !bet?.lock_at) return 60;
  const ms = new Date(bet.settle_at).getTime() - new Date(bet.lock_at).getTime();
  return ms > 0 ? Math.round(ms / 1000) : 60;
}

// Mirror of worker/sigmaTracker.js#canonicalSymbol — strips the slash on
// crypto display symbols ("BTC/USDT" → "BTCUSDT") so the per-pair table
// lookup matches the keys the worker writes (internal symbol form).
function canonicalSymbol(s) {
  if (typeof s !== "string") return s;
  return s.replace(/^([A-Z0-9]+)\/USDT$/, "$1USDT");
}

function annVolFor(symbol, config) {
  const sym = canonicalSymbol(symbol);
  const cls = getAssetConfig(symbol)?.assetClass;
  // Per-pair override (from the calibration table) → class default → fallback.
  // Matches the worker's annVolFor() lookup precedence in worker/zoneTrades.js.
  return config?.zone?.annVolByPair?.[sym]
      ?? config?.zone?.annVolByClass?.[cls]
      ?? config?.zone?.defaultAnnVol
      ?? DEFAULT_ANN_VOL;
}

// Absolute Near→Mid (t1) and Mid→Far/KO (t2) thresholds for a (symbol, duration)
// pair, expressed as fractional moves from strike (0.0018 = 0.18%). Mirrors the
// worker's zoneThresholdsFor. Used pre-trade to draw the chart bands.
export function zoneThresholdsFor(symbol, durationSec, config) {
  const k1 = config?.zone?.k1 ?? 0.52;
  const k2 = config?.zone?.k2 ?? 1.64;
  const sigma = annVolFor(symbol, config) * Math.sqrt((durationSec || 60) / SECONDS_PER_YEAR);
  return { t1: k1 * sigma, t2: k2 * sigma };
}

const DEFAULT_PAY = {
  nearWin: 0.2125, nearLoss: 0.25,
  midWin:  0.425,  midLoss:  0.50,
  koWin:   0.85,   koLoss:   1.00,
};

// Classify a live bet at `price` into its current zone and the matching payoff.
// MIRROR of the worker's zonePnl. Uses the bet's snapshotted t1_pct/t2_pct so
// in-flight bets agree with what the worker will settle on; falls back to the
// live config thresholds for legacy rows. Returns { pnl, zone, fav, payFrac }.
export function classifyZone(bet, price, config) {
  if (!bet || price == null) return { pnl: 0, zone: "flat", fav: 0, payFrac: 0 };
  const stake = +bet.stake;
  const entry = +bet.strike_price;
  if (!entry || !stake) return { pnl: 0, zone: "flat", fav: 0, payFrac: 0 };
  const dir = bet.direction === "up" ? 1 : -1;
  const fav = dir * (price - entry) / entry;
  const a = Math.abs(fav);
  const live = zoneThresholdsFor(bet.symbol, durationSecOf(bet), config);
  const t1 = bet.t1_pct != null ? +bet.t1_pct : live.t1;
  const t2 = bet.t2_pct != null ? +bet.t2_pct : live.t2;
  const pay = config?.zone?.pay || DEFAULT_PAY;
  let zone, payFrac;
  if (a >= t2)      { zone = "far";  payFrac = fav > 0 ? pay.koWin   : -pay.koLoss; }
  else if (a >= t1) { zone = "mid";  payFrac = fav > 0 ? pay.midWin  : -pay.midLoss; }
  else              { zone = "near"; payFrac = fav > 0 ? pay.nearWin : (fav < 0 ? -pay.nearLoss : 0); }
  return { pnl: stake * payFrac, zone, fav, payFrac };
}

// Back-compat scalar P&L for callers that just want the dollar value (chart
// labels, active-positions sign, history outcome). Uses the zone classifier.
export function zonePnl(bet, price, config) {
  return classifyZone(bet, price, config).pnl;
}

// Early-exit quote — fair-value buyout at the live state. Replaces the old
// "pay the current zone value" rule, which gave the trader free option value
// (see scripts/zoneEarlyExit.mjs and scripts/zoneFairValue.mjs). Returns the
// same { pnl, zone } shape callers already use; pnl is now the buyout offer.
export function zoneExitQuote(bet, livePrice, config) {
  if (!bet || livePrice == null) return null;
  const { pnl, zone } = zoneBuyout(bet, livePrice, config);
  return { pnl, zone };
}

// Human label for a zone code (UI helper).
export function zoneLabel(zone) {
  return zone === "far" ? "Knockout"
       : zone === "mid" ? "Mid"
       : zone === "near" ? "Near"
       : "—";
}
