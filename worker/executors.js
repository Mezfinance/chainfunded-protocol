"use strict";

/**
 * worker/executors.js
 *
 * Called on every price tick with the in-memory trade + account cache.
 * Zero DB reads at runtime. Writes to Supabase immediately and base44
 * only on critical events (SL/TP hit, drawdown breach).
 */

const {
  workerUpdateChallengeAccount,
  workerUpdateTrade,
} = require("./base44Bridge");
const { createNotification } = require("./notifications");
const sigmaTracker = require("./sigmaTracker");
const { insertLedgerRow } = require("./ledgerSig");
const { ASSET_CLASS, getAssetClass } = require("./marketHours.cjs");

function fmtUsd(n) {
  const num = Number(n) || 0;
  const sign = num >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

// ── Balance persistence ──────────────────────────────────────────────────────
//
// current_balance is DERIVED from ground truth (the sum of an account's closed-
// trade pnl) rather than maintained as an incremental running total. The old
// `current_balance += pnl` approach lost updates: the cached account object is
// concurrently *replaced* by Supabase realtime events and the 5-min cache
// refresh (setAccountInCache), so an increment computed against a since-replaced
// object was silently dropped — leaving the stored balance well below
// starting_balance + Σpnl. Recomputing from the trade rows is idempotent and
// immune to that race. Callers MUST mark the trade `closed` in the DB BEFORE
// calling this so the just-closed trade is included in the sum. (This adds one
// SELECT per close — closes are infrequent vs. the per-tick hot path.)
//
// Guards mirror the frontend reconciliation (TraderDashboard): a *failed*
// account's balance is its breach equity and a *paid-out* account's balance
// reflects withdrawals — neither equals starting + Σpnl — so those keep their
// existing value, adjusted only by this trade's pnl.
async function persistCloseBalance({ base44, supabase, acct, pnl }) {
  if (!acct) return null;
  const accountId = acct.account_id || acct.id;

  acct.daily_loss_today = (acct.daily_loss_today ?? 0) + Math.min(0, pnl);

  const startingBalance = acct.starting_balance ?? acct.account_size ?? 0;
  const derivable = acct.phase !== "failed" && !acct.payout_tx_hash && startingBalance > 0;

  if (derivable) {
    // Trades reference their account by the account's `id` (sometimes by
    // `account_id` for older rows) — the two can differ. Match on either so the
    // sum is complete regardless of which key a given trade used.
    const acctIds = [...new Set([acct.id, acct.account_id].filter(Boolean))];
    const { data, error } = await supabase
      .from("trades")
      .select("pnl")
      .in("account_id", acctIds)
      .eq("status", "closed");
    if (error) {
      console.error(`[balance] recompute query failed ${accountId}: ${error.message} — falling back to increment`);
      acct.current_balance = (acct.current_balance ?? 0) + pnl;
    } else {
      const realised = (data || []).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
      acct.current_balance = startingBalance + realised;
    }
  } else {
    acct.current_balance = (acct.current_balance ?? 0) + pnl;
  }

  const update = { current_balance: acct.current_balance, daily_loss_today: acct.daily_loss_today };
  // Base44 records are keyed by the record id (acct.id) — NOT account_id —
  // which is why these writes were silently failing for accounts where the two
  // differ. Supabase matches on account_id (its row's account_id column).
  await Promise.all([
    workerUpdateChallengeAccount(base44, acct.id || accountId, update).catch(() => {}),
    supabase.from("challenge_accounts").update(update).eq("account_id", accountId),
  ]).catch((err) => console.error(`[balance] persist failed ${accountId}: ${err.message}`));

  return acct.current_balance;
}

const drawdownRunning = new Set();

function ledgerInsert(supabase, row) {
  // Sign (worker attestation) then insert. Fire-and-forget, as before.
  insertLedgerRow(supabase, row)
    .then(({ error }) => {
      if (error) console.error("[ledger] Insert failed:", error.message, JSON.stringify(row));
    })
    .catch((e) => console.error("[ledger] sign/insert failed:", e.message, JSON.stringify(row)));
}

// Latest price per symbol — updated on every tick. Used by the drawdown
// check to compute unrealised P&L across ALL accounts, even if the current
// tick's symbol doesn't match a given account's open positions.
const latestPrices = new Map();

// ── Fill-freshness guard ──────────────────────────────────────────────────────
//
// Market fills use the worker's cached feed price (server.js handleTradeOpen/
// handleTradeClose). If that cache lags the real market — a feed gap, a stalled
// socket, or a violently fast tick — a trader can enter/exit at the stale
// price and capture the difference (observed in the 0aa2… incident: fills
// systematically better than the canonical price, ~56% of P&L). This store
// records, per symbol, HOW FRESH the last price is so the fill path can refuse
// to fill on a stale/uncertain price. `latestPrices` (price only) is unchanged
// for the non-critical unrealised-PnL/monitoring reads.
//
// A fill is refused when ANY of:
//   • receipt age  — ms since we last received a tick for this symbol (feed gap)
//   • publish age  — ms since the provider's own timestamp (clock-skew-tolerant)
//   • spread       — half the bid/ask spread in bps (wide = illiquid/fast market)
//
// The spread check replaces Pyth's confidence interval, which no exchange or
// broker publishes. Half-spread is the closest analogue: like conf it is a ±
// band around the mid, so the same threshold shape and units still apply.
//
// Thresholds are PER ASSET CLASS because the providers tick at very different
// rates. Binance pushes crypto sub-second, so a 2s gap there is a real fault.
// eToro pushes FX/commodities/stocks every ~2-5s, so the same 2s limit would
// reject nearly every non-crypto fill. Tune from the "rejected — stale price"
// logs rather than guessing; the defaults are deliberately conservative.
const priceMeta = new Map(); // symbol -> { receiptMs, publishMs, confBps }

const CRYPTO_FILL_LIMITS = {
  ageMs:        Number(process.env.WORKER_MAX_FILL_AGE_MS)         || 2000,
  publishAgeMs: Number(process.env.WORKER_MAX_FILL_PUBLISH_AGE_MS) || 3000,
  spreadBps:    Number(process.env.WORKER_MAX_FILL_SPREAD_BPS)     || 25,
};

// ~5s observed worst-case gap on eToro, doubled for headroom. Stocks quote
// wider than FX, so the spread ceiling is separately generous.
const BROKER_FILL_LIMITS = {
  ageMs:        Number(process.env.WORKER_MAX_FILL_AGE_MS_BROKER)         || 12000,
  publishAgeMs: Number(process.env.WORKER_MAX_FILL_PUBLISH_AGE_MS_BROKER) || 15000,
  spreadBps:    Number(process.env.WORKER_MAX_FILL_SPREAD_BPS_BROKER)     || 60,
};

function fillLimitsFor(symbol) {
  return getAssetClass(symbol) === ASSET_CLASS.CRYPTO ? CRYPTO_FILL_LIMITS : BROKER_FILL_LIMITS;
}

function checkTick({ base44, supabase, symbol, price, meta, pendingOrders, openTrades, accountCache, removeFromCache }) {
  const now = new Date().toISOString();
  const match = (t) => symbolsMatch(t.symbol, symbol);

  // Record this symbol's latest price so later drawdown iterations can use it
  latestPrices.set(symbol, price);
  // …and its freshness, for the fill guard (getFreshPrice).
  priceMeta.set(symbol, {
    receiptMs: Date.now(),
    publishMs: meta && Number.isFinite(meta.publishTimeMs) ? meta.publishTimeMs : null,
    confBps:   meta && Number.isFinite(meta.conf) && price > 0 ? (meta.conf / price) * 1e4 : null,
  });

  // Feed the per-symbol EWMA vol tracker for Zone Trading. Updates on
  // minute boundaries; cheap on intra-minute ticks.
  sigmaTracker.noteTick(symbol, price);

  const myPending = pendingOrders.filter(match);
  const myOpen    = openTrades.filter(match);

  // ── 1. Limit / stop-limit orders ─────────────────────────────────────────
  for (const order of myPending) {
    if (!order.limit_price) continue;
    const isLong = order.direction === "long";
    let fill = false;

    if (order.order_type === "stop_limit") {
      const stopHit = order.stop_price && (isLong ? price <= order.stop_price : price >= order.stop_price);
      fill = stopHit && (isLong ? price <= order.limit_price : price >= order.limit_price);
    } else {
      fill = isLong ? price <= order.limit_price : price >= order.limit_price;
    }

    if (!fill) continue;
    removeFromCache(order.id);

    const acctForOpen = accountCache.get(order.account_id);
    ledgerInsert(supabase, {
      event_type:     "trade_open",
      account_id:     order.account_id,
      trader_address: acctForOpen?.trader_address || "",
      trade_id:       order.id,
      symbol:         order.symbol,
      direction:      order.direction,
      size_usdc:      order.size,
      leverage:       order.leverage,
      entry_price:    order.limit_price,
      opened_at:      now,
      balance_before: acctForOpen?.current_balance ?? null,
      balance_after:  acctForOpen?.current_balance ?? 0,
    });

    const update = { status: "open", entry_price: order.limit_price, open_time: now };
    Promise.all([
      workerUpdateTrade(base44, order.id, update),
      supabase.from("trades").update(update).eq("id", order.id),
    ]).then(() => {
      console.log(`[executor] Limit filled: ${order.symbol} ${order.direction} @ $${order.limit_price} (acct ${order.account_id})`);
      const trader = acctForOpen?.trader_address;
      if (trader) {
        createNotification(supabase, {
          recipient: trader,
          type: "limit_filled",
          title: `Limit ${order.direction} filled — ${order.symbol}`,
          body: `@ $${Number(order.limit_price).toFixed(2)} · acct ${order.account_id}`,
          link: `/TradingTerminal?account=${order.account_id}`,
          payload: { tradeId: order.id, accountId: order.account_id, symbol: order.symbol, direction: order.direction, price: order.limit_price },
        }).catch(() => {});
      }
    }).catch(err => {
      console.error(`[executor] Fill failed ${order.id}:`, err.message);
    });
  }

  // ── 2. SL / TP ────────────────────────────────────────────────────────────
  for (const trade of myOpen) {
    if (!trade.entry_price) continue;
    const isLong = trade.direction === "long";
    const hitSL = trade.sl && (isLong ? price <= trade.sl : price >= trade.sl);
    const hitTP = trade.tp && (isLong ? price >= trade.tp : price <= trade.tp);
    if (!hitSL && !hitTP) continue;

    removeFromCache(trade.id);

    const exitPrice = hitSL ? trade.sl : trade.tp;
    const movePct   = (exitPrice - trade.entry_price) / trade.entry_price;
    const pnl       = (isLong ? 1 : -1) * movePct * trade.size;
    const margin    = trade.leverage > 0 ? trade.size / trade.leverage : trade.size;
    const closeData = {
      status: "closed", exit_price: exitPrice, pnl,
      pnl_pct: margin > 0 ? (pnl / margin) * 100 : 0,
      close_time: now,
    };

    const acct = accountCache.get(trade.account_id);
    const balanceBefore = acct?.current_balance ?? null;

    // Write to both DBs — base44 immediately for critical events
    Promise.all([
      workerUpdateTrade(base44, trade.id, closeData),
      supabase.from("trades").update(closeData).eq("id", trade.id),
    ]).then(async () => {
      // Trade is now `closed` in both stores → recompute balance from ground
      // truth (race-proof) instead of an incremental += that can be lost.
      const balanceAfter = acct ? await persistCloseBalance({ base44, supabase, acct, pnl }) : null;

      console.log(`[executor] ${hitSL ? "SL" : "TP"} hit: ${trade.symbol} ${trade.direction} P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (acct ${trade.account_id})`);
      const trader = acct?.trader_address;
      if (trader) {
        createNotification(supabase, {
          recipient: trader,
          type: hitSL ? "sl_hit" : "tp_hit",
          title: `${hitSL ? "Stop-loss" : "Take-profit"} hit on ${trade.symbol}`,
          body: `${trade.direction} closed at $${Number(exitPrice).toFixed(2)} · ${fmtUsd(pnl)}`,
          link: `/TradingTerminal?account=${trade.account_id}`,
          payload: {
            tradeId: trade.id,
            accountId: trade.account_id,
            symbol: trade.symbol,
            direction: trade.direction,
            exitPrice,
            pnl,
            reason: hitSL ? "sl" : "tp",
          },
        }).catch(() => {});
      }
      ledgerInsert(supabase, {
        event_type:     "trade_close",
        account_id:     trade.account_id,
        trader_address: acct?.trader_address || "",
        trade_id:       trade.id,
        symbol:         trade.symbol,
        direction:      trade.direction,
        size_usdc:      trade.size,
        leverage:       trade.leverage,
        entry_price:    trade.entry_price,
        exit_price:     exitPrice,
        pnl_usdc:       pnl,
        close_reason:   hitSL ? "sl" : "tp",
        opened_at:      trade.open_time,
        closed_at:      now,
        balance_before: balanceBefore,
        balance_after:  balanceAfter ?? 0,
      });
    }).catch(err => {
      console.error(`[executor] Close failed ${trade.id}:`, err.message);
    });
  }

  // ── 3. Drawdown — checked on EVERY tick for ALL non-failed accounts ─────
  //
  // We iterate the full accountCache (not just accounts with open trades on
  // the current symbol) because:
  //   - A trader can be in breach from realised losses alone, with no open
  //     positions. If we only checked accounts with positions on this tick's
  //     symbol, the breach would sit uncaught forever.
  //   - An account might have open positions on different symbols than the
  //     one currently ticking. We use latestPrices to compute unrealised
  //     across all of them.
  //
  // Group open trades by account once, then run the check against every
  // cached account (open positions or not).
  const openByAccount = new Map();
  for (const trade of openTrades) {
    if (!trade.account_id) continue;
    if (!openByAccount.has(trade.account_id)) openByAccount.set(trade.account_id, []);
    openByAccount.get(trade.account_id).push(trade);
  }

  const seenAccounts = new Set();
  for (const acct of accountCache.values()) {
    // The cache is keyed by BOTH id and account_id, so the same account object
    // appears under two keys when they differ. Dedupe by object identity to
    // process each account once — otherwise the breach fires twice (the guard
    // keys differ) and the account_id pass misses positions keyed by record id.
    if (!acct || seenAccounts.has(acct)) continue;
    seenAccounts.add(acct);

    if (acct.phase === "failed" || acct.phase === "paid_out") continue;
    const ddKey = acct.id || acct.account_id;
    if (ddKey && drawdownRunning.has(ddKey)) continue;

    const startBal = acct.starting_balance ?? acct.account_size ?? 0;
    if (startBal <= 0) continue;

    // Trades reference their account by either id or account_id — gather both.
    const accountTrades = [
      ...(openByAccount.get(acct.id) || []),
      ...(acct.account_id && acct.account_id !== acct.id ? (openByAccount.get(acct.account_id) || []) : []),
    ];

    // Unrealised PnL across ALL open positions using latest known prices
    // per symbol. Positions on symbols we haven't seen yet contribute 0.
    const unrealPnl = accountTrades.reduce((sum, t) => {
      if (!t.entry_price || !t.size) return sum;
      const livePrice = latestPrices.get(t.symbol)
        ?? latestPrices.get(t.symbol?.replace("/", ""))
        ?? latestPrices.get(t.symbol?.replace(/USDT$/, "/USDT"));
      if (!livePrice) return sum;
      return sum + (t.direction === "long" ? 1 : -1) * ((livePrice - t.entry_price) / t.entry_price) * t.size;
    }, 0);

    const liveBalance   = (acct.current_balance ?? 0) + unrealPnl;
    const totalLossPct  = Math.max(0, ((startBal - liveBalance) / startBal) * 100);
    // Daily drawdown = from today's opening balance (snapshotted at UTC
    // midnight) down to current live equity. Ignores intra-day peaks above
    // open and any winning trades — only measures actual loss from the
    // day's reference point. Falls back to starting_balance for accounts
    // that predate the day_start_balance field.
    // Fallback to current_balance for accounts that predate the field.
    // Self-heals at next UTC midnight reset when day_start_balance is snapshotted.
    const dayStart      = acct.day_start_balance ?? acct.current_balance ?? startBal;
    const dailyLossPct  = Math.max(0, ((dayStart - liveBalance) / startBal) * 100);

    const totalBreached = totalLossPct >= (acct.max_total_loss_pct ?? 10);
    const dailyBreached = dailyLossPct >= (acct.max_daily_loss_pct ?? 5);

    if (!totalBreached && !dailyBreached) continue;

    // Breach detected — close all open positions + fail account
    if (ddKey) drawdownRunning.add(ddKey);
    executeDrawdownBreach({
      base44, supabase, acct, accountId: acct.account_id || acct.id,
      trades: accountTrades,
      liveBalance, totalLossPct, dailyLossPct,
      removeFromCache, now,
    }).finally(() => { if (ddKey) drawdownRunning.delete(ddKey); });
  }
}

async function executeDrawdownBreach({ base44, supabase, acct, accountId, trades, liveBalance, totalLossPct, dailyLossPct, removeFromCache, now }) {
  console.warn(`[executor] DRAWDOWN BREACH acct ${accountId}: total=${totalLossPct.toFixed(2)}% daily=${dailyLossPct.toFixed(2)}%`);

  try {
    // Close each open position at its latest known market price. Trades on
    // different symbols use their respective latestPrices entries. If no
    // price is known yet (shouldn't happen once ticks start arriving), fall
    // back to entry_price so P&L is 0 for that leg.
    await Promise.all(trades.map(t => {
      removeFromCache(t.id);
      const livePrice = latestPrices.get(t.symbol)
        ?? latestPrices.get(t.symbol?.replace("/", ""))
        ?? latestPrices.get(t.symbol?.replace(/USDT$/, "/USDT"))
        ?? t.entry_price;
      const movePct = (livePrice - t.entry_price) / t.entry_price;
      const pnl     = (t.direction === "long" ? 1 : -1) * movePct * t.size;
      const margin  = t.leverage > 0 ? t.size / t.leverage : t.size;
      const closeData = {
        status: "closed",
        exit_price: livePrice,
        pnl,
        pnl_pct: margin > 0 ? (pnl / margin) * 100 : 0,
        close_time: now,
      };
      return Promise.all([
        workerUpdateTrade(base44, t.id, closeData),
        supabase.from("trades").update(closeData).eq("id", t.id),
      ]);
    }));

    // Fail the account
    const breachBalanceBefore = acct.current_balance ?? 0;
    acct.phase = "failed";
    acct.current_balance = liveBalance;
    const failData = { phase: "failed", current_balance: liveBalance };
    ledgerInsert(supabase, {
      event_type:     "drawdown_breach",
      account_id:     accountId,
      trader_address: acct.trader_address || "",
      balance_before: breachBalanceBefore,
      balance_after:  liveBalance,
    });
    await Promise.all([
      // Base44 records are keyed by the record id (acct.id); Supabase by account_id.
      workerUpdateChallengeAccount(base44, acct.id || accountId, failData),
      supabase.from("challenge_accounts").update(failData).eq("account_id", accountId),
    ]);

    console.warn(`[executor] Account ${accountId} failed (total=${totalLossPct.toFixed(2)}% daily=${dailyLossPct.toFixed(2)}%) — all open positions force-closed`);
  } catch (err) {
    console.error(`[executor] Drawdown close failed ${accountId}:`, err.message);
  }
}

function symbolsMatch(tradeSymbol, tickSymbol) {
  if (!tradeSymbol) return false;
  if (tradeSymbol === tickSymbol) return true;
  const plain = tickSymbol.replace("/", "");
  const slash = tickSymbol.replace(/USDT$/, "/USDT");
  return tradeSymbol === plain || tradeSymbol === slash || tradeSymbol.replace("/", "") === plain;
}

function getLatestPrice(symbol) {
  return latestPrices.get(symbol)
    ?? latestPrices.get(symbol?.replace("/", ""))
    ?? latestPrices.get(symbol?.replace(/USDT$/, "/USDT"));
}

function _metaFor(symbol) {
  return priceMeta.get(symbol)
    ?? priceMeta.get(symbol?.replace("/", ""))
    ?? priceMeta.get(symbol?.replace(/USDT$/, "/USDT"));
}

// Freshness-guarded price read for the FILL path. Returns the cached price plus
// whether it is fresh enough to fill on. Callers must refuse the fill when
// `fresh` is false (see server.js). `price` is null when no price is cached yet.
function getFreshPrice(symbol, now = Date.now()) {
  const price = getLatestPrice(symbol);
  if (price == null) return { price: null, fresh: false, reason: "no_price", ageMs: null, publishAgeMs: null, confBps: null };
  const meta = _metaFor(symbol);
  if (!meta) return { price, fresh: false, reason: "no_meta", ageMs: null, publishAgeMs: null, confBps: null };

  const limits       = fillLimitsFor(symbol);
  const ageMs        = now - meta.receiptMs;
  const publishAgeMs = meta.publishMs != null ? Math.max(0, now - meta.publishMs) : null;
  const confBps      = meta.confBps; // half-spread in bps — see the guard notes above

  let reason = null;
  if (ageMs > limits.ageMs) reason = `stale_feed:${Math.round(ageMs)}ms>${limits.ageMs}ms`;
  else if (publishAgeMs != null && publishAgeMs > limits.publishAgeMs) reason = `stale_publish:${Math.round(publishAgeMs)}ms>${limits.publishAgeMs}ms`;
  else if (confBps != null && confBps > limits.spreadBps) reason = `wide_spread:${confBps.toFixed(1)}bps>${limits.spreadBps}bps`;

  return { price, fresh: reason === null, reason, ageMs, publishAgeMs, confBps };
}

module.exports = { checkTick, getLatestPrice, getFreshPrice, persistCloseBalance };
