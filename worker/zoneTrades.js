"use strict";

/**
 * worker/zoneTrades.js
 *
 * Zone Trading engine (funded mode MVP).
 *
 * Each bet is a leveraged Up/Down position with a trader-chosen hold window
 * (60–240s). The |Δ| (% price move from strike) at settle classifies the
 * trade into one of three zones with matched-magnitude payoffs:
 *
 *   Near (|Δ| < T1)        ±25% stake     symmetric (zero EV)
 *   Mid  (T1 ≤ |Δ| < T2)   ±50% stake     symmetric (zero EV)
 *   Far  (|Δ| ≥ T2)        +85% / −100%   asymmetric → house edge
 *
 * T1 = k1·σ_window and T2 = k2·σ_window where σ_window is computed per
 * (asset class, duration) from an annualised vol table; k1/k2 are σ-multipliers
 * locked at launch from scripts/zoneWidths.mjs (Cautious widths).
 *
 * Sticky knockout: the 1s leader ticker scans every pending bet — the first
 * time |Δ| crosses ±T2 the trade settles instantly at the Far payoff. This
 * closes the asymmetric early-exit game (exit Far-favour, hold Far-against)
 * that hold-to-expiry would otherwise leak.
 *
 * Realised P&L is written as a CLOSED row in `trades` so balance derivation
 * (current_balance = starting + Σ closed-trade pnl) and the per-tick drawdown
 * enforcement pick it up with zero changes. A parallel `zone_trades` row
 * keeps the game-specific history (direction, strike, t1/t2, settled zone).
 *
 * Stake is reserved in memory the moment a bet is placed so a trader can't
 * over-commit by stacking concurrent bets inside the same window (which
 * would otherwise let them blow well past the drawdown limit before any
 * settle).
 */

const {
  workerCreateTrade,
  workerUpdateTrade,
} = require("./base44Bridge");
const { createNotification } = require("./notifications");
const { getAssetClass } = require("./marketHours.cjs");
const { buyout: fairValueBuyout, EXIT_MARGIN } = require("./zoneFairValue");
const sigmaTracker = require("./sigmaTracker");

// ── Config (env-overridable; defaults are placeholders pending sign-off) ─────
const DURATION_MS    = parseInt(process.env.ZONE_DURATION_MS    || "60000", 10);
const BASE_DURATION_SEC = 60; // leverage/fee calibration reference window
const DEFAULT_DURATION_SEC = Math.max(1, Math.round(DURATION_MS / 1000));
// Selectable hold windows (seconds). Zone widths are expressed in σ-units, so
// the absolute T1/T2 grow with √(duration/60) automatically — the staircase
// keeps the same feel across durations without per-duration tuning.
const DURATIONS_SEC = (process.env.ZONE_DURATIONS_SEC || "60,90,120,150,180,210,240")
  .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
const MIN_STAKE      = parseFloat(process.env.ZONE_MIN_STAKE    || "1");      // USDC (= margin / max loss)
const MAX_STAKE_PCT  = parseFloat(process.env.ZONE_MAX_STAKE_PCT || "0.02");  // of starting balance
const MAX_STAKE_ABS  = parseFloat(process.env.ZONE_MAX_STAKE_ABS || "5000");  // hard ceiling

// ── Zone Trading model ──────────────────────────────────────────────────────
// The window's |Δ| (% price move from strike) settles into one of three zones
// with matched-magnitude payoffs; the house edge lives in the knockout cap.
//
//   Near (|Δ| < T1)        ±ZONE_PAY.near × stake     symmetric (zero EV)
//   Mid  (T1 ≤ |Δ| < T2)   ±ZONE_PAY.mid  × stake     symmetric (zero EV)
//   Far  (|Δ| ≥ T2)        +ZONE_PAY.koWin / −koLoss   asymmetric → edge
//
// Sticky knockout: the first time |Δ| crosses T2 the trade settles instantly
// at the Far payoff (the auto-tick checks every pending bet). This closes the
// asymmetric exit-favour / hold-against game that hold-to-expiry would leak.
//
// Widths are σ-multipliers, so a single (k1, k2) covers the whole duration ×
// asset-class matrix; σ is computed per (class, duration) from annualised vol.
// Calibration in scripts/zoneWidths.mjs — locked 2026-05-28 to Cautious widths
// targeting ~18% KO rate and ~+1.4% house EV per trade.
const ZONE_K1 = parseFloat(process.env.ZONE_K1 || "0.52");
const ZONE_K2 = parseFloat(process.env.ZONE_K2 || "1.64");
// Uniform 15% house margin on the WIN side of every zone — loss pays the full
// zone base, win pays base × (1 − ZONE_WIN_EDGE). So Near = +21.25/−25,
// Mid = +42.5/−50, Far/KO = +85/−100. Edge accumulates across all three zones
// instead of living only in the knockout cap (≈ 3.7% house EV/trade under
// Cautious widths + sticky KO, vs ≈ 1.4% with edge in KO only).
const ZONE_WIN_EDGE = parseFloat(process.env.ZONE_WIN_EDGE || "0.15");
const _NEAR_BASE    = parseFloat(process.env.ZONE_NEAR_BASE || "0.25");
const _MID_BASE     = parseFloat(process.env.ZONE_MID_BASE  || "0.50");
const _FAR_BASE     = parseFloat(process.env.ZONE_FAR_BASE  || "1.00");
const ZONE_PAY = {
  nearWin:  _NEAR_BASE * (1 - ZONE_WIN_EDGE),
  nearLoss: _NEAR_BASE,
  midWin:   _MID_BASE  * (1 - ZONE_WIN_EDGE),
  midLoss:  _MID_BASE,
  koWin:    _FAR_BASE  * (1 - ZONE_WIN_EDGE),
  koLoss:   _FAR_BASE,
};
// Annualised vol per asset class (calibrated; env-tunable). Used as a fallback
// when a pair isn't found in the per-pair table below.
const ANN_VOL_BY_CLASS = {
  crypto:      parseFloat(process.env.ZONE_VOL_CRYPTO      || "0.80"),
  fx:          parseFloat(process.env.ZONE_VOL_FX          || "0.08"),
  commodities: parseFloat(process.env.ZONE_VOL_COMMODITIES || "0.22"),
  stocks:      parseFloat(process.env.ZONE_VOL_STOCKS      || "0.28"),
};
const DEFAULT_ANN_VOL = parseFloat(process.env.ZONE_VOL_DEFAULT || "0.30");
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// Per-pair annVol table (from scripts/zoneCalibratePerPair.mjs --generate).
// Optional: the file is only present after a calibration run. Per-pair entries
// override the class default, which overrides DEFAULT_ANN_VOL.
let PER_PAIR_VOL = null;
let PER_PAIR_CLASS_DEFAULTS = null;
try {
  const tbl = require("./zoneAnnVolByPair.json");
  PER_PAIR_VOL = tbl.perPair || null;
  PER_PAIR_CLASS_DEFAULTS = tbl._classDefaults || null;
} catch (_) {
  // No calibration file yet — fall back to env-driven class defaults only.
}

// Static fallback chain — used as a baseline by the live EWMA tracker (for
// warm-up blending + floor/cap), and as a hard fallback if the EWMA hasn't
// been fed any ticks for the symbol yet.
function staticAnnVolFor(symbol) {
  // Canonicalise so that "BTC/USDT" (display, sent by the frontend) and
  // "BTCUSDT" (internal, used by the price tick stream + per-pair JSON)
  // both resolve to the same per-pair entry. Without this, crypto bets
  // silently fall through to the crypto class default.
  const sym = sigmaTracker.canonicalSymbol(symbol);
  const envKey = `ZONE_VOL_PAIR_${String(sym || "").replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal && Number.isFinite(parseFloat(envVal))) return parseFloat(envVal);
  if (PER_PAIR_VOL && PER_PAIR_VOL[sym] != null) return PER_PAIR_VOL[sym];
  const cls = getAssetClass(sym);
  if (PER_PAIR_CLASS_DEFAULTS && PER_PAIR_CLASS_DEFAULTS[cls] != null) return PER_PAIR_CLASS_DEFAULTS[cls];
  return ANN_VOL_BY_CLASS[cls] || DEFAULT_ANN_VOL;
}
function annVolFor(symbol) {
  // Live EWMA of 1-minute returns (~30-min half-life) over the static
  // fallback, with warm-up blending + floor/cap so the bands track current
  // regime instead of multi-year averages.
  return sigmaTracker.annVolFor(symbol, staticAnnVolFor(symbol));
}
function sigmaFor(symbol, durationSec) {
  return annVolFor(symbol) * Math.sqrt(durationSec / SECONDS_PER_YEAR);
}
function zoneThresholdsFor(symbol, durationSec) {
  const s = sigmaFor(symbol, durationSec);
  return { t1: ZONE_K1 * s, t2: ZONE_K2 * s };
}

function durationSecOf(bet) {
  const ms = new Date(bet.settle_at).getTime() - new Date(bet.lock_at).getTime();
  return ms > 0 ? Math.round(ms / 1000) : DEFAULT_DURATION_SEC;
}

// Classify a bet at `price` into its zone and return the matching payoff.
// Uses the per-bet t1_pct/t2_pct snapshot when present (so in-flight bets are
// immune to live config changes); falls back to live thresholds for legacy
// rows. Returns { pnl, zone: 'near'|'mid'|'far'|'flat', fav }.
function zonePnl(bet, price) {
  const stake = Number(bet.stake);
  const entry = Number(bet.strike_price);
  if (!entry || !stake) return { pnl: 0, zone: "flat", fav: 0 };
  const dir = bet.direction === "up" ? 1 : -1;
  const fav = dir * (price - entry) / entry;
  const a = Math.abs(fav);
  const t1 = bet.t1_pct != null
    ? Number(bet.t1_pct)
    : zoneThresholdsFor(bet.symbol, durationSecOf(bet)).t1;
  const t2 = bet.t2_pct != null
    ? Number(bet.t2_pct)
    : zoneThresholdsFor(bet.symbol, durationSecOf(bet)).t2;
  let zone, payFrac;
  if (a >= t2)      { zone = "far";  payFrac = fav > 0 ? ZONE_PAY.koWin   : -ZONE_PAY.koLoss; }
  else if (a >= t1) { zone = "mid";  payFrac = fav > 0 ? ZONE_PAY.midWin  : -ZONE_PAY.midLoss; }
  else              { zone = "near"; payFrac = fav > 0 ? ZONE_PAY.nearWin : (fav < 0 ? -ZONE_PAY.nearLoss : 0); }
  return { pnl: stake * payFrac, zone, fav };
}

// ── Feature gate ──────────────────────────────────────────────────────────────
// ZONE_ENABLED   — "false" disables the feature entirely (default: enabled).
// ZONE_ALLOWLIST — comma-separated trader addresses allowed to play. When the
//                   env var is UNSET, defaults to the launch test wallet; set
//                   it to "" to open the feature to everyone.
// Both fall back to the legacy TURBO_* names so existing prod env config
// keeps working until the deployment is updated.
const ENABLED = (process.env.ZONE_ENABLED ?? process.env.TURBO_ENABLED) !== "false";

const DEFAULT_ALLOWLIST = [
  "0x7172ec3dbcdcbfed1f439af4c330a94063428f10",
  "0x7d6fa8b8f5bb3342022e7517872665cb71539366",
  "0x01157eaabfe6e37f5a6d7e47cdd36498442e66cd",
  "0x20c02a6422f4c34069475e388d54f700eed18e42",
  "0xd0b58c0d49ecbca0837b6af27b131ff3540db722",
  "0xff2b256a324a401957ec7d99c8fbff6a2ca1c10e",
  "0xb05bfa14abfe724dc9c07674087f116a91805539",
  "0xd2def3139d3899df2f8229a4370eb06bea0007ed",
  "0xd610873101650c35a87762600829237b5926be5d",
];
const _ALLOWLIST_RAW = process.env.ZONE_ALLOWLIST ?? process.env.TURBO_ALLOWLIST;
const ALLOWLIST = _ALLOWLIST_RAW === undefined
  ? DEFAULT_ALLOWLIST
  : _ALLOWLIST_RAW.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function maxStakeFor(acct) {
  const start = acct?.starting_balance ?? acct?.account_size ?? 0;
  return Math.min(MAX_STAKE_ABS, start > 0 ? start * MAX_STAKE_PCT : MAX_STAKE_ABS);
}

class ZoneTradesEngine {
  constructor({ supabase, base44, accountCache, getLatestPrice, persistCloseBalance, getOpenTrades, getPendingOrders }) {
    this.supabase = supabase;
    this.base44 = base44;
    this.accountCache = accountCache;
    this.getLatestPrice = getLatestPrice;
    this.persistCloseBalance = persistCloseBalance;
    this.getOpenTrades = getOpenTrades || (() => []);
    this.getPendingOrders = getPendingOrders || (() => []);

    // account_id → reserved USDC across that account's pending bets
    this.pendingStake = new Map();
    // settling guard so the ticker can't double-settle the same bet
    this.settling = new Set();

    this.enabled = ENABLED;
  }

  // Whether a trader address may place bets. An empty allowlist = open to all.
  isAllowed(address) {
    if (ALLOWLIST.length === 0) return true;
    return !!address && ALLOWLIST.includes(String(address).toLowerCase());
  }

  config({ symbol } = {}) {
    // On-demand σ warming: the frontend tells us the pair the user is
    // viewing and we warm that one (and only that one). Everything else
    // gets its σ from the static per-pair fallback table — which is fine,
    // because the chart only renders bands for the one symbol on screen.
    // Cuts a 66-symbol Pyth burst on cold start to a single fetch.
    if (symbol) {
      sigmaTracker.warmStart(symbol);
    }
    // Only return σ for symbols we've actually warmed (have a state entry).
    // Unwarmed symbols → the client mirror falls back through annVolByClass
    // → defaultAnnVol. Saves bytes too.
    const warmedSymbols = Array.from(sigmaTracker._state.keys());
    return {
      durationMs: DURATION_MS,
      durations: DURATIONS_SEC,
      defaultDurationSec: DEFAULT_DURATION_SEC,
      baseDurationSec: BASE_DURATION_SEC,
      zone: {
        k1: ZONE_K1,
        k2: ZONE_K2,
        pay: ZONE_PAY,
        annVolByClass: PER_PAIR_CLASS_DEFAULTS || ANN_VOL_BY_CLASS,
        defaultAnnVol: DEFAULT_ANN_VOL,
        annVolByPair: sigmaTracker.getAnnVolTable(warmedSymbols, staticAnnVolFor),
        exitMargin: EXIT_MARGIN,
      },
      minStake: MIN_STAKE,
      maxStakePct: MAX_STAKE_PCT,
      maxStakeAbs: MAX_STAKE_ABS,
    };
  }

  reservedFor(accountId) {
    return this.pendingStake.get(accountId) || 0;
  }

  _reserve(accountId, amount) {
    this.pendingStake.set(accountId, this.reservedFor(accountId) + amount);
  }

  _release(accountId, amount) {
    const next = this.reservedFor(accountId) - amount;
    if (next > 0.000001) this.pendingStake.set(accountId, next);
    else this.pendingStake.delete(accountId);
  }

  // Available balance = current_balance − open-trade margin − pending-order
  // margin − already-reserved zone stake. Mirrors the server's trade margin
  // check so a zone trade can't reuse capital that's committed elsewhere.
  availableBalance(acct) {
    const accountId = acct.account_id || acct.id;
    const marginOf = (t) => (t.leverage > 0 ? t.size / t.leverage : t.size);
    const ids = new Set([acct.id, acct.account_id].filter(Boolean));
    const inUse =
      this.getOpenTrades()
        .filter((t) => ids.has(t.account_id) && t.status === "open")
        .reduce((s, t) => s + marginOf(t), 0) +
      this.getPendingOrders()
        .filter((t) => ids.has(t.account_id) && t.status === "pending")
        .reduce((s, t) => s + marginOf(t), 0);
    return (acct.current_balance ?? 0) - inUse - this.reservedFor(accountId);
  }

  // ── Place a funded-mode bet ────────────────────────────────────────────────
  // Auth (api_secret) + account lookup happen in server.js before this is
  // called; `acct` is the cached account object.
  async placeBet({ acct, symbol, direction, stake, durationSec }) {
    if (!["up", "down"].includes(direction)) {
      return { status: 400, body: { error: "direction must be 'up' or 'down'" } };
    }
    const dur = durationSec == null ? DEFAULT_DURATION_SEC : Math.round(Number(durationSec));
    if (!DURATIONS_SEC.includes(dur)) {
      return { status: 400, body: { error: `duration must be one of: ${DURATIONS_SEC.join(", ")}s` } };
    }
    const amount = Number(stake);
    if (!(amount > 0)) {
      return { status: 400, body: { error: "stake must be a positive number" } };
    }
    if (amount < MIN_STAKE) {
      return { status: 400, body: { error: `Minimum stake is $${MIN_STAKE}` } };
    }
    const accountId = acct.account_id || acct.id;

    // Cap AGGREGATE live (reserved) stake, not just this single bet — otherwise
    // a trader stacks many sub-cap bets in one 60s window (same strike, same
    // settle) to reconstitute a full-balance wager on one coin flip, defeating
    // the per-bet cap and the economics model (which assumes ≤cap in play at a
    // time, sequentially).
    const maxLive = maxStakeFor(acct);
    const liveReserved = this.reservedFor(accountId);
    if (amount + liveReserved > maxLive + 1e-9) {
      const remaining = Math.max(0, maxLive - liveReserved);
      return {
        status: 400,
        body: { error: `Max live stake is $${maxLive.toFixed(2)} — you have $${liveReserved.toFixed(2)} in open bets ($${remaining.toFixed(2)} left)` },
      };
    }

    const available = this.availableBalance(acct);
    if (amount > available) {
      return {
        status: 400,
        body: { error: `Insufficient balance — available: $${available.toFixed(2)}, stake: $${amount.toFixed(2)}` },
      };
    }

    const strike = this.getLatestPrice(symbol);
    if (!strike) {
      return { status: 503, body: { error: `No price available for ${symbol} — try again shortly` } };
    }

    const now = Date.now();
    const lockAt = new Date(now).toISOString();
    const settleAt = new Date(now + dur * 1000).toISOString();
    const { t1, t2 } = zoneThresholdsFor(symbol, dur);

    const row = {
      mode: "funded",
      account_id: accountId,
      trader_address: acct.trader_address || "",
      symbol,
      direction,
      stake: amount,
      leverage: 1, // unused under the zone model; kept for schema compatibility
      strike_price: strike,   // entry price
      t1_pct: t1,             // Near→Mid barrier (fractional move)
      t2_pct: t2,             // Mid→Far (knockout) barrier
      lock_at: lockAt,
      settle_at: settleAt,
      status: "pending",
    };

    const { data, error } = await this.supabase
      .from("zone_trades")
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error("[zone] bet insert failed:", error.message);
      return { status: 500, body: { error: "Could not place bet" } };
    }

    // Reserve only after the row is durably persisted.
    this._reserve(accountId, amount);
    console.log(`[zone] Bet placed: ${symbol} ${direction} $${amount} ${dur}s strike=${strike} acct=${accountId}`);
    return { status: 201, body: data };
  }

  // ── Settlement ──────────────────────────────────────────────────────────────
  // Called by the 1s leader ticker. Each tick we scan EVERY pending bet (not
  // just the overdue ones) so that the first time |Δ| crosses ±T2 a bet is
  // knocked out at the Far payoff. Intra-tick barrier touches that revert
  // before the next sample are missed by design — acceptable at expected
  // volumes; revisit with a price-update hook if traffic grows.
  async settleDue() {
    const now = Date.now();
    const { data, error } = await this.supabase
      .from("zone_trades")
      .select("*")
      .eq("status", "pending")
      .limit(500);
    if (error) {
      console.error("[zone] settleDue query failed:", error.message);
      return;
    }
    for (const bet of data || []) {
      if (this.settling.has(bet.id)) continue;
      const due = new Date(bet.settle_at).getTime() <= now;
      const ko = !due && this._knockoutTouched(bet);
      if (!due && !ko) continue;
      this.settling.add(bet.id);
      try {
        await this._settleBet(bet, { knockedOut: ko });
      } catch (err) {
        console.error(`[zone] settle failed for bet ${bet.id}:`, err.message);
      } finally {
        this.settling.delete(bet.id);
      }
    }
  }

  // Sticky-KO check: is the current live price beyond ±T2 from strike?
  _knockoutTouched(bet) {
    const price = this.getLatestPrice(bet.symbol);
    if (!price) return false;
    const { zone } = zonePnl(bet, price);
    return zone === "far";
  }

  // Record realised P&L as a CLOSED trade row (so balance derivation +
  // drawdown include it) and recompute the balance. Returns the trade id.
  // No row for a zero-P&L refund.
  async _applyPnl({ acct, bet, settlePrice, pnl }) {
    if (pnl === 0 || !acct) return null;
    const accountId = acct.account_id || acct.id;
    const stake = Number(bet.stake);
    const tradeData = {
      account_id: accountId,
      trader_address: bet.trader_address || acct.trader_address || "",
      symbol: bet.symbol,
      direction: bet.direction === "up" ? "long" : "short",
      entry_price: Number(bet.strike_price),
      exit_price: settlePrice,
      size: stake,
      leverage: 1, // zone product is non-leveraged; size is the stake
      status: "closed",
      order_type: "zone",
      open_time: bet.lock_at,
      close_time: new Date().toISOString(),
      pnl,
      pnl_pct: stake > 0 ? (pnl / stake) * 100 : 0,
    };
    let tradeId = null;
    try {
      const created = await workerCreateTrade(this.base44, tradeData);
      tradeId = created?.id || null;
      if (tradeId) await this.supabase.from("trades").upsert({ ...tradeData, id: tradeId }, { onConflict: "id" });
    } catch (err) {
      console.error(`[zone] trade row create failed for bet ${bet.id}:`, err.message);
    }
    try {
      await this.persistCloseBalance({ base44: this.base44, supabase: this.supabase, acct, pnl });
    } catch (err) {
      console.error(`[zone] balance persist failed for bet ${bet.id}:`, err.message);
    }
    return tradeId;
  }

  _notify(bet, { result, pnl, settlePrice, zone }) {
    const accountId = bet.account_id;
    const acct = this.accountCache.get(accountId);
    const trader = bet.trader_address || acct?.trader_address;
    if (!trader) return;
    const titles = { win: "Trade closed up", loss: "Trade closed down", refund: "Trade closed flat", exited: "Trade exited" };
    const zoneLabel = zone === "far" ? "Knockout zone"
                    : zone === "mid" ? "Mid zone"
                    : zone === "near" ? "Near zone" : "";
    createNotification(this.supabase, {
      recipient: trader,
      type: `zone_${result}`,
      title: `${titles[result] || "Trade"} — ${bet.symbol}`,
      body: `${bet.direction.toUpperCase()} · ${zoneLabel} · entry $${Number(bet.strike_price)} → $${settlePrice} · ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
      link: `/ZoneTrades?account=${accountId}`,
      payload: { betId: bet.id, accountId, symbol: bet.symbol, direction: bet.direction, result, pnl, zone, strike: Number(bet.strike_price), settlePrice },
    }).catch(() => {});
  }

  async _settleBet(bet, { knockedOut = false } = {}) {
    const accountId = bet.account_id;
    const settlePrice = this.getLatestPrice(bet.symbol);

    // No authoritative price → cannot settle fairly. Leave pending; retry next tick.
    if (!settlePrice) {
      console.warn(`[zone] no price for ${bet.symbol} — bet ${bet.id} stays pending`);
      return;
    }

    const stake = Number(bet.stake);
    const { pnl, zone } = zonePnl(bet, settlePrice);
    const result = pnl > 0 ? "win" : pnl < 0 ? "loss" : "refund";

    // Atomic claim: only the writer that flips pending→terminal books the P&L,
    // so an early exit racing the settlement can never double-pay.
    const { data: claimed } = await this.supabase
      .from("zone_trades")
      .update({ status: result, settle_price: settlePrice, pnl, settled_zone: zone })
      .eq("id", bet.id).eq("status", "pending")
      .select();
    if (!claimed || !claimed.length) return; // already exited/settled elsewhere

    const acct = this.accountCache.get(accountId);
    const tradeId = await this._applyPnl({ acct, bet, settlePrice, pnl });
    if (tradeId) await this.supabase.from("zone_trades").update({ trade_id: tradeId }).eq("id", bet.id);
    this._release(accountId, stake);

    const tag = knockedOut ? "KO" : "expiry";
    console.log(`[zone] Settled ${bet.id} (${tag} · ${zone}): ${bet.symbol} ${bet.direction} ${result} ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (strike=${bet.strike_price} settle=${settlePrice})`);
    this._notify(bet, { result, pnl, settlePrice, zone });
  }

  // ── Early exit — fair-value buyout ─────────────────────────────────────────
  // Offers the trader the EXPECTED hold-to-expiry payoff at the live state
  // (live z* in σ-units, τ window fraction remaining) under sticky-KO,
  // haircut by EXIT_MARGIN. Under a martingale this exactly removes the
  // trader's option value — see scripts/zoneFairValue.mjs and the
  // ~20% pool-drain demonstration in scripts/zoneEarlyExit.mjs. A position
  // that has touched ±T2 is already being settled by the auto-tick; atomic
  // claim in cashOut resolves the race.
  quoteExit(bet, livePrice) {
    // Pass the LIVE σ for the bet's window so the buyout's τ_eff reflects
    // current EWMA, not the σ snapshotted at placement. Keeps the buyout
    // honest when vol shifts mid-trade.
    const durSec = durationSecOf(bet);
    const currentSigma = annVolFor(bet.symbol) * Math.sqrt(durSec / SECONDS_PER_YEAR);
    return fairValueBuyout(bet, livePrice, { currentSigma });
  }

  async cashOut({ acct, betId }) {
    const accountId = acct.account_id || acct.id;
    const { data: bet, error } = await this.supabase
      .from("zone_trades").select("*").eq("id", betId).maybeSingle();
    if (error || !bet) return { status: 404, body: { error: "Trade not found" } };
    if (bet.status !== "pending") return { status: 400, body: { error: "Trade already settled" } };
    if (bet.account_id !== accountId) return { status: 403, body: { error: "Trade does not belong to this account" } };

    const livePrice = this.getLatestPrice(bet.symbol);
    if (!livePrice) return { status: 503, body: { error: `No price available for ${bet.symbol}` } };

    const { pnl, zone } = this.quoteExit(bet, livePrice);

    // Atomic claim pending→exited — loses the race to settlement cleanly.
    const { data: claimed } = await this.supabase
      .from("zone_trades")
      .update({ status: "exited", settle_price: livePrice, pnl, settled_zone: zone })
      .eq("id", betId).eq("status", "pending")
      .select();
    if (!claimed || !claimed.length) return { status: 400, body: { error: "Trade already settled" } };

    const tradeId = await this._applyPnl({ acct, bet, settlePrice: livePrice, pnl });
    if (tradeId) await this.supabase.from("zone_trades").update({ trade_id: tradeId }).eq("id", betId);
    this._release(accountId, Number(bet.stake));

    console.log(`[zone] Early exit ${betId} (${zone}): ${bet.symbol} ${bet.direction} ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} @ ${livePrice}`);
    this._notify(bet, { result: "exited", pnl, settlePrice: livePrice, zone });
    return { status: 200, body: { ...bet, status: "exited", settle_price: livePrice, pnl, settled_zone: zone, trade_id: tradeId } };
  }

  // ── Startup recovery ──────────────────────────────────────────────────────
  // Reserve stake for in-window pending bets; refund any whose settle window
  // elapsed while the worker was down (can't settle fairly on a stale price).
  async loadPending() {
    const { data, error } = await this.supabase
      .from("zone_trades")
      .select("*")
      .eq("status", "pending")
      .limit(1000);
    if (error) {
      console.error("[zone] loadPending failed:", error.message);
      return;
    }
    const now = Date.now();
    let reserved = 0, refunded = 0;
    for (const bet of data || []) {
      const settleMs = new Date(bet.settle_at).getTime();
      if (settleMs <= now) {
        // Overdue — refund (release nothing reserved yet on a fresh boot).
        try {
          await this.supabase
            .from("zone_trades")
            .update({ status: "refund", pnl: 0 })
            .eq("id", bet.id);
          refunded++;
        } catch (err) {
          console.error(`[zone] startup refund failed for ${bet.id}:`, err.message);
        }
      } else {
        this._reserve(bet.account_id, Number(bet.stake));
        reserved++;
      }
    }
    if (reserved || refunded) {
      console.log(`[zone] loadPending: ${reserved} in-window reserved, ${refunded} overdue refunded`);
    }
  }
}

module.exports = { ZoneTradesEngine, maxStakeFor };
