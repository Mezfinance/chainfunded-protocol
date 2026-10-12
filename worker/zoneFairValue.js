"use strict";

/**
 * worker/zoneFairValue.js
 *
 * Embedded fair-value buyout for Zone Trading early exit.
 *
 *   V(z*, τ) = E[payoff at expiry | current z* in σ-units, τ window fraction
 *               remaining, sticky-KO at ±k2]
 *
 * The dimensionless (z*, τ) lookup table in zoneFairValueTable.json is built
 * by scripts/zoneFairValue.mjs --generate. Under a martingale the buyout
 * EXACTLY equals the expected hold-to-expiry payoff, so the trader's option
 * value is zero (see analysis in that script).
 *
 * A small house margin (default 5%, env-tunable via ZONE_EXIT_MARGIN) is
 * subtracted from the offer to recoup the convenience premium. The margin
 * always pushes against the trader (haircut on profits, surcharge on losses).
 *
 * Vol-regime correction: the bet's t2_pct is snapshotted at placement, so
 * the σ recovered from it is σ_at_placement. If the caller passes
 * `currentSigma` (the live EWMA-derived σ for the same window), we scale τ
 * to reflect the actual remaining variance: τ_eff = τ · (σ_now / σ_pl)².
 * This is exact under GBM and keeps the buyout honest when vol shifts
 * mid-trade.
 */

const TABLE = require("./zoneFairValueTable.json");
const EXIT_MARGIN = parseFloat(process.env.ZONE_EXIT_MARGIN || String(TABLE.exitMargin || 0.05));

const { k1, k2, pay, zGrid, tauGrid, V } = TABLE;
const Z_MIN = zGrid[0], Z_MAX = zGrid[zGrid.length - 1];
const TAU_MIN = tauGrid[0], TAU_MAX = tauGrid[tauGrid.length - 1];

function terminalPay(z) {
  const a = Math.abs(z);
  if (a >= k2) return z > 0 ? pay.koWin   : -pay.koLoss;
  if (a >= k1) return z > 0 ? pay.midWin  : -pay.midLoss;
  return        z > 0 ? pay.nearWin : (z < 0 ? -pay.nearLoss : 0);
}

// Bilinear lookup on the (z, τ) grid with two end-of-range refinements:
//   • τ < TAU_MIN: blend linearly between V(z, TAU_MIN) and terminalPay(z)
//     using t = τ / TAU_MIN, so the buyout smoothly collapses to the actual
//     settle value in the final few seconds (no cliff at the grid edge).
//   • |z| ∈ (Z_MAX, k2): blend linearly between V(±Z_MAX, τ) and the KO
//     payoff using w = (|z| − Z_MAX) / (k2 − Z_MAX), so values just inside
//     the KO line ramp toward it instead of clamping.
function interpolateV(z, tau) {
  if (z >=  k2) return  pay.koWin;
  if (z <= -k2) return -pay.koLoss;
  if (tau <= 0) return terminalPay(z);

  // Sub-grid τ → blend to terminal payoff
  if (tau < TAU_MIN) {
    const vEdge = interpolateV(z, TAU_MIN);
    const term  = terminalPay(z);
    const t     = tau / TAU_MIN;
    return t * vEdge + (1 - t) * term;
  }

  // Beyond-grid |z| (between Z_MAX and k2) → blend to KO
  if (z > Z_MAX) {
    const vEdge = interpolateV(Z_MAX, tau);
    const w     = (z - Z_MAX) / (k2 - Z_MAX);
    return (1 - w) * vEdge + w * pay.koWin;
  }
  if (z < -Z_MAX) {
    const vEdge = interpolateV(-Z_MAX, tau);
    const w     = (-z - Z_MAX) / (k2 - Z_MAX);
    return (1 - w) * vEdge + w * (-pay.koLoss);
  }

  const tauC = Math.max(TAU_MIN, Math.min(TAU_MAX, tau));
  const zC   = Math.max(Z_MIN,   Math.min(Z_MAX,   z));

  let τLo = tauGrid[0], τHi = tauGrid[1];
  for (let i = 0; i < tauGrid.length - 1; i++) {
    if (tauGrid[i] <= tauC && tauC <= tauGrid[i + 1]) { τLo = tauGrid[i]; τHi = tauGrid[i + 1]; break; }
  }
  let zLo = zGrid[0], zHi = zGrid[1];
  for (let i = 0; i < zGrid.length - 1; i++) {
    if (zGrid[i] <= zC && zC <= zGrid[i + 1]) { zLo = zGrid[i]; zHi = zGrid[i + 1]; break; }
  }
  const t = τHi === τLo ? 0 : (tauC - τLo) / (τHi - τLo);
  const u = zHi === zLo ? 0 : (zC - zLo) / (zHi - zLo);
  const key = (n) => n.toFixed(2);
  const v00 = V[key(τLo)][key(zLo)];
  const v01 = V[key(τLo)][key(zHi)];
  const v10 = V[key(τHi)][key(zLo)];
  const v11 = V[key(τHi)][key(zHi)];
  return (1 - t) * (1 - u) * v00 + (1 - t) * u * v01
       + t       * (1 - u) * v10 + t       * u * v11;
}

// Buyout pnl in stake-currency for an active bet at livePrice.
//   z       = fav / σ_placement   — current move in σ-units of the window
//   τ_eff   = τ_remaining · (σ_now / σ_placement)²   (clamped to [0, 1])
//             so a mid-trade vol regime shift updates the fair value
//             without invalidating the bet's fixed barriers.
//   v       = interpolateV(z, τ_eff)
//   buyout  = v − margin · |v|     ← spread always against the trader
//
// Returns { pnl, zone, fav, fairValueFrac, marginPct, tauRemain, tauEff, z, sigmaPlacement }.
function buyout(bet, livePrice, opts = {}) {
  const margin = opts.margin != null ? opts.margin : EXIT_MARGIN;
  const stake = Number(bet.stake);
  const entry = Number(bet.strike_price);
  if (!entry || !stake) {
    return { pnl: 0, zone: "flat", fav: 0, fairValueFrac: 0, marginPct: margin, tauRemain: 0, tauEff: 0, z: 0, sigmaPlacement: 0 };
  }

  const dir = bet.direction === "up" ? 1 : -1;
  const fav = dir * (livePrice - entry) / entry;

  // Recover σ_window from the bet's snapshotted t2_pct (= k2 · σ_at_placement).
  const t2 = bet.t2_pct != null ? Number(bet.t2_pct) : null;
  const sigmaPlacement = t2 != null && k2 > 0 ? t2 / k2 : 0;
  const z = sigmaPlacement > 0 ? fav / sigmaPlacement : 0;

  // τ as fraction of the chosen window remaining.
  const settleMs = new Date(bet.settle_at).getTime();
  const lockMs   = new Date(bet.lock_at).getTime();
  const totalMs  = Math.max(1, settleMs - lockMs);
  const nowMs    = opts.now != null ? opts.now : Date.now();
  const tauRemain = Math.max(0, Math.min(1, (settleMs - nowMs) / totalMs));

  // Vol-regime adjustment: scale τ by (σ_now / σ_placement)² to reflect the
  // actual remaining variance under the current EWMA estimate. No-op when
  // currentSigma is omitted or equal to placement σ.
  let tauEff = tauRemain;
  if (opts.currentSigma != null && sigmaPlacement > 0) {
    const ratio = Number(opts.currentSigma) / sigmaPlacement;
    if (Number.isFinite(ratio) && ratio > 0) {
      tauEff = Math.max(0, Math.min(1, tauRemain * ratio * ratio));
    }
  }

  // Current zone of the live price for the UI badge (independent of buyout).
  const a = Math.abs(z);
  const zone = a >= k2 ? "far" : a >= k1 ? "mid" : "near";

  const v = interpolateV(z, tauEff);
  // Margin is a SPREAD: always shrinks the trader's payoff toward worse —
  // haircut on profits (v > 0) and surcharge on losses (v < 0).
  const fairValueFrac = v - margin * Math.abs(v);
  return {
    pnl: stake * fairValueFrac,
    zone, fav, fairValueFrac, marginPct: margin,
    tauRemain, tauEff, z, sigmaPlacement,
  };
}

module.exports = { interpolateV, buyout, terminalPay, EXIT_MARGIN, TABLE };
