"use strict";

/**
 * worker/index.js
 *
 * Persistent position monitor — Supabase is the source of truth at runtime.
 *
 * Architecture:
 *   - In-memory cache of trades AND accounts (from Supabase)
 *   - Supabase real-time pushes changes instantly (zero polling)
 *   - Drawdown checked on EVERY price tick using in-memory data (zero DB reads)
 *   - Writes go to Supabase immediately; base44 only on critical events
 *   - Periodic sync (every 60s) pushes account state to base44
 *
 * DB call budget:
 *   Startup : 4 queries (pending trades, open trades, active accounts, backfill)
 *   Runtime : 0 reads — all checks use in-memory cache
 *   Writes  : Supabase on every state change; base44 on SL/TP/drawdown only
 *   Sync    : 1 batch write to base44 every 60s (account balances)
 */

const { createClient: createBase44 } = require("@base44/sdk");
const { supabase }    = require("./supabase");
const { BinancePriceFeed, EtoroPriceFeed } = require("./prices");
const { checkTick, getLatestPrice, getFreshPrice, persistCloseBalance } = require("./executors");
const { insertLedgerRow } = require("./ledgerSig");
const { LeaderElection } = require("./leader");
const { startServer }  = require("./server");
const { DiscordBot }  = require("./discord");
const { CfgIndexer }  = require("./cfgIndexer");
const { PayoutsSync } = require("./payoutsSync");
const { CommunityFeeds } = require("./communityFeeds");
const { ZoneTradesEngine } = require("./zoneTrades");
const { PriceBroadcaster } = require("./priceStream");
const { getAssetClass, isMarketOpen } = require("./marketHours.cjs");
const {
  workerUpdateChallengeAccount,
  workerUpdateTrade,
} = require("./base44Bridge");

const {
  CRYPTO_ASSETS,
  FX_ASSETS,
  COMMODITY_ASSETS,
  STOCK_ASSETS,
} = require("./assetConfig.cjs");

// Mirror console output into the worker_logs table (flushed daily) so we have a
// durable audit trail — Fly only keeps a few days of live logs. Installed here,
// before anything logs, so startup output is captured too.
const logStore = require("./logStore");
logStore.installConsoleCapture();

// ── base44 client (writes only) ───────────────────────────────────────────────

const appId      = process.env.BASE44_APP_ID;
const appBaseUrl = process.env.BASE44_APP_BASE_URL || "https://base44.app";

if (!appId) {
  console.error("[worker] BASE44_APP_ID env var is required. Exiting.");
  process.exit(1);
}

const base44 = createBase44({ appId, requiresAuth: false, serverUrl: appBaseUrl, appBaseUrl });

// ── In-memory trade cache — kept fresh by Supabase real-time ─────────────────

let pendingOrders = [];
let openTrades    = [];
let cacheReady    = false;

// ── In-memory account cache — kept fresh by Supabase real-time ───────────────

const accountCache = new Map(); // businessId → account object

// Trades reference accounts by their business id (base44's id / Supabase's
// account_id column), not by Supabase's primary-key id. The two can diverge
// when base44 generates its own id on create and ignores the client's hint —
// in that case Supabase.id ends up as the client-generated value while
// base44.id (mirrored into Supabase.account_id) becomes the business key.
// Always key the cache (and all downstream joins) by the business id.
const acctKey = (a) => a?.account_id || a?.id;

// Some records have id !== account_id (e.g. accounts manually recovered via
// Base44 admin where the user set account_id to the on-chain string). The
// frontend sometimes sends `account.id` and sometimes `account.account_id`,
// so index the cache under both keys when they differ — any inbound lookup
// resolves to the same row.
function setAccountInCache(acct) {
  if (!acct) return;
  if (acct.account_id) accountCache.set(acct.account_id, acct);
  if (acct.id && acct.id !== acct.account_id) accountCache.set(acct.id, acct);
}

function deleteAccountFromCache(acct) {
  if (!acct) return;
  if (acct.account_id) accountCache.delete(acct.account_id);
  if (acct.id && acct.id !== acct.account_id) accountCache.delete(acct.id);
}

function accountKeysFor(acct) {
  const keys = [];
  if (acct?.account_id) keys.push(acct.account_id);
  if (acct?.id && acct.id !== acct.account_id) keys.push(acct.id);
  return keys;
}


function addOrUpdate(trade) {
  if (trade.status === "pending") {
    openTrades    = openTrades.filter(t => t.id !== trade.id);
    pendingOrders = [...pendingOrders.filter(t => t.id !== trade.id), trade];
  } else if (trade.status === "open") {
    pendingOrders = pendingOrders.filter(t => t.id !== trade.id);
    openTrades    = [...openTrades.filter(t => t.id !== trade.id), trade];
  } else {
    // closed / cancelled — remove from both
    pendingOrders = pendingOrders.filter(t => t.id !== trade.id);
    openTrades    = openTrades.filter(t => t.id !== trade.id);
  }
}

function removeFromCache(id) {
  pendingOrders = pendingOrders.filter(t => t.id !== id);
  openTrades    = openTrades.filter(t => t.id !== id);
}

// ── Load initial state ───────────────────────────────────────────────────────

async function loadInitialCache() {
  try {
    // 1. Load trades from Supabase
    const [{ data: pending }, { data: open }] = await Promise.all([
      supabase.from("trades").select("*").eq("status", "pending"),
      supabase.from("trades").select("*").eq("status", "open"),
    ]);
    pendingOrders = pending || [];
    openTrades    = open    || [];
    console.log(`[worker] Supabase cache: ${pendingOrders.length} pending, ${openTrades.length} open`);

    // 2. Load accounts from Supabase
    const { data: accounts } = await supabase
      .from("challenge_accounts")
      .select("*")
      .not("phase", "eq", "failed")
      .not("phase", "eq", "paid_out");
    if (accounts) {
      for (const acct of accounts) {
        setAccountInCache(acct);
      }
    }
    console.log(`[worker] Account cache: ${accountCache.size} active accounts`);

    // 3. Backfill from base44 (one-time at startup)
    const [b44Pending, b44Open] = await Promise.all([
      base44.entities.Trade.filter({ status: "pending" }).catch(() => []),
      base44.entities.Trade.filter({ status: "open"    }).catch(() => []),
    ]);

    const known = new Set([...pendingOrders, ...openTrades].map(t => t.id));
    const newPending = b44Pending.filter(t => !known.has(t.id));
    const newOpen    = b44Open.filter(t => !known.has(t.id));

    if (newPending.length || newOpen.length) {
      console.log(`[worker] Backfilling ${newPending.length} pending + ${newOpen.length} open trades from base44 → Supabase`);
      pendingOrders = [...pendingOrders, ...newPending];
      openTrades    = [...openTrades,    ...newOpen];
      const all = [...newPending, ...newOpen];
      try { await supabase.from("trades").upsert(all, { onConflict: "id" }); } catch {}
    }

    // 4. Backfill accounts from base44 that aren't in Supabase yet
    await syncAccountsFromBase44();

    cacheReady = true;
    console.log(`[worker] Cache ready: ${pendingOrders.length} pending, ${openTrades.length} open, ${accountCache.size} accounts`);
  } catch (err) {
    console.error("[worker] Failed to load initial cache:", err.message);
    setTimeout(loadInitialCache, 5_000);
  }
}

// ── Supabase real-time subscriptions ─────────────────────────────────────────

let tradesChannel = null;
let accountsChannel = null;

function subscribeRealtime() {
  // Trades subscription
  if (tradesChannel) supabase.removeChannel(tradesChannel);
  tradesChannel = supabase
    .channel("trades-monitor")
    .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, (payload) => {
      const trade = payload.new || payload.old;
      if (!trade?.id) return;
      if (payload.eventType === "DELETE") { removeFromCache(trade.id); return; }
      addOrUpdate(trade);
      const label = payload.eventType === "INSERT" ? "New" : "Updated";
      console.log(`[realtime] ${label} trade ${trade.id}: ${trade.symbol} ${trade.direction} status=${trade.status}`);
    })
    .subscribe((status) => {
      console.log(`[realtime] Trades subscription: ${status}`);
      if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        console.warn("[realtime] Trades reconnecting in 5s...");
        setTimeout(subscribeRealtime, 5_000);
      }
    });

  // Accounts subscription
  if (accountsChannel) supabase.removeChannel(accountsChannel);
  accountsChannel = supabase
    .channel("accounts-monitor")
    .on("postgres_changes", { event: "*", schema: "public", table: "challenge_accounts" }, (payload) => {
      const acct = payload.new || payload.old;
      if (!acct) return;
      if (payload.eventType === "DELETE" || acct.phase === "failed" || acct.phase === "paid_out") {
        deleteAccountFromCache(acct);
        // Trigger reconciliation when an account transitions to failed/paid_out
        // — closes any open/pending trades that survived the breach handler.
        if (acct.phase === "failed" || acct.phase === "paid_out") {
          reconcileFailedAccounts();
        }
      } else {
        // Supabase is source of truth — cache every active account, even if
        // it happens to 404 on base44 sync (id mapping issues shouldn't disable
        // drawdown enforcement).
        setAccountInCache(acct);
      }
      console.log(`[realtime] Account ${acctKey(acct)}: phase=${acct.phase} balance=${acct.current_balance}`);
    })
    .subscribe((status) => {
      console.log(`[realtime] Accounts subscription: ${status}`);
    });
}

// ── Periodic base44 → Supabase account sync ─────────────────────────────────
// Self-healing path: even when the frontend's syncAccount() call fails
// (RLS, network, race), the worker pulls Base44's ChallengeAccount list
// every 60s and upserts any missing rows into Supabase, making them
// trade-eligible automatically.

// Columns that exist on the Supabase challenge_accounts table (verified
// against the live schema). Base44 carries additional fields
// (challenge_fee_usdc, fee_tx_hash, profit_target_pct, status, peak_balance,
// notes, …) which aren't mirrored — those are stripped before upsert.
//
// Keep in sync with src/lib/supabaseClient.js ACCOUNT_COLS. The
// upsertAccountsAdaptive() retry below also catches drift if either side
// gets out of step.
const SUPABASE_ACCOUNT_COLS_INITIAL = [
  "id",
  "account_id",
  "trader_address",     "account_size",
  "starting_balance",   "current_balance",
  "phase",
  "max_daily_loss_pct", "max_total_loss_pct",
  "daily_loss_today",   "day_start_balance",
  "api_secret",
  "start_date",
];

// Persisted across calls: columns Supabase has rejected with "column not
// found in schema cache". Once a column is in here, future syncs skip it.
const _accountColsDenied = new Set();

function pickSupabaseAccountFields(acct) {
  const out = {};
  for (const k of SUPABASE_ACCOUNT_COLS_INITIAL) {
    if (acct[k] !== undefined && !_accountColsDenied.has(k)) out[k] = acct[k];
  }
  return out;
}

// Upsert with adaptive column dropping. PostgREST returns errors like
// "Could not find the 'X' column of 'Y' in the schema cache" — we extract
// X, add it to the denied set, and retry with a slimmer payload. Bounded
// retries so a genuinely-broken table can't loop forever.
async function upsertAccountsAdaptive(rows) {
  let payload = rows;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { error } = await supabase
      .from("challenge_accounts")
      .upsert(payload, { onConflict: "id" });
    if (!error) return true;

    const m = error.message?.match(/the '([^']+)' column/);
    if (!m) {
      console.error("[worker] base44 → Supabase account sync failed:", error.message);
      return false;
    }
    const bad = m[1];
    if (_accountColsDenied.has(bad)) {
      console.error("[worker] base44 → Supabase upsert keeps rejecting", bad);
      return false;
    }
    _accountColsDenied.add(bad);
    console.warn(`[worker] Supabase challenge_accounts has no '${bad}' column — dropping from sync`);
    payload = rows.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) {
        if (!_accountColsDenied.has(k)) out[k] = r[k];
      }
      return out;
    });
  }
  console.error("[worker] base44 → Supabase account sync gave up after 10 retries");
  return false;
}

async function syncAccountsFromBase44() {
  try {
    const b44Accounts = await base44.entities.ChallengeAccount.filter({});
    const list = Array.isArray(b44Accounts) ? b44Accounts : [];
    if (list.length === 0) return;

    const knownAccts = new Set([...accountCache.keys()]);
    const newAccounts = list.filter(
      a => !knownAccts.has(acctKey(a)) && a.phase !== "failed" && a.phase !== "paid_out"
    );
    if (newAccounts.length === 0) return;

    console.log(`[worker] Syncing ${newAccounts.length} accounts from base44 → Supabase`);
    for (const acct of newAccounts) setAccountInCache(acct);
    const rows = newAccounts.map(pickSupabaseAccountFields);
    await upsertAccountsAdaptive(rows);
  } catch (err) {
    console.error("[worker] syncAccountsFromBase44 error:", err.message);
  }
}

// ── Periodic base44 sync (every 60s) ─────────────────────────────────────────
// Push current account state to base44 so the UI stays accurate
// without relying on base44 reads at runtime.

// Accounts that exist only in Supabase (no Base44 record). Base44 returns 400
// for these on every mirror write; once seen we stop retrying so the logs don't
// fill with the same 400s each cycle. Cleared on restart, so an account that
// later gains a Base44 record is retried after the next deploy.
const base44MissingAccounts = new Set();
function isBase44NotFound(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 400 || status === 404) return true;
  return /status code 40[04]|not found|no such/i.test(err?.message || "");
}

async function syncAccountsToBase44() {
  if (!cacheReady || accountCache.size === 0) return;
  let synced = 0;
  let missing = 0;
  const seen = new Set();
  for (const acct of accountCache.values()) {
    // The cache is keyed by BOTH id and account_id, so each account appears
    // under two keys — dedupe to one write per account, otherwise we'd also
    // call Base44 with the account_id (which 400s, since Base44 resolves by
    // record id).
    if (!acct || seen.has(acct)) continue;
    seen.add(acct);

    // Base44 records are keyed by the record id (acct.id), NOT account_id.
    const recId = acct.id || acct.account_id;
    if (!recId) continue;
    if (base44MissingAccounts.has(recId)) { missing++; continue; }

    try {
      // Only sync daily_loss_today, day_start_balance and phase — NOT
      // current_balance (the worker writes that explicitly on close/breach).
      const update = {
        daily_loss_today:  acct.daily_loss_today ?? 0,
        day_start_balance: acct.day_start_balance ?? acct.starting_balance ?? 0,
      };
      if (acct.phase) update.phase = acct.phase;
      await workerUpdateChallengeAccount(base44, recId, update);
      synced++;
    } catch (err) {
      // A record genuinely missing from Base44 (400/404) exists only in
      // Supabase — remember it and stop retrying every cycle. Supabase is the
      // runtime source of truth, so enforcement is unaffected.
      if (isBase44NotFound(err)) {
        if (!base44MissingAccounts.has(recId)) {
          console.warn(`[sync] account ${recId} not in base44 — skipping its base44 mirror writes`);
          base44MissingAccounts.add(recId);
        }
        missing++;
      } else {
        console.warn(`[sync] base44 update failed for ${recId}: ${err.message || err.status}`);
      }
    }
  }
  if (synced > 0) {
    console.log(`[sync] Pushed ${synced} accounts to base44${missing > 0 ? ` (${missing} supabase-only, skipped)` : ""}`);
  }
}

// ── Midnight UTC daily reset ──────────────────────────────────────────────────
// Snapshots current_balance as day_start_balance (the reference point for
// daily drawdown for the next 24h) and resets daily_loss_today to 0.
//
// Daily drawdown formula: max(0, day_start_balance - live_equity) / starting_balance
// Unrealised losses from open positions carry over naturally because they
// lower live_equity, so traders don't get a free pass on overnight positions.

async function resetDailyLoss() {
  if (!cacheReady || accountCache.size === 0) return;
  console.log(`[daily-reset] Snapshotting day_start_balance for ${accountCache.size} accounts`);
  for (const [businessId, acct] of accountCache.entries()) {
    const newDayStart = acct.current_balance ?? acct.starting_balance ?? 0;
    acct.day_start_balance = newDayStart;
    acct.daily_loss_today  = 0;
    try {
      // Match by account_id (business id) since Supabase.id can diverge from
      // base44.id — trades and the cache both key off the business id.
      await supabase
        .from("challenge_accounts")
        .update({ day_start_balance: newDayStart, daily_loss_today: 0 })
        .eq("account_id", businessId);
    } catch {}
  }
  console.log(`[daily-reset] Complete`);
}

// ── Failed-account reconciliation ────────────────────────────────────────────
// When an account is failed (drawdown breach, manual fail, etc), all of its
// open and pending orders must be closed/cancelled. The breach handlers
// already do this, but if any of those writes fail (network blip, base44
// hiccup) the account ends up failed with stranded trades. This sweep
// reconciles by closing any open/pending trades on failed/paid_out accounts.
async function reconcileFailedAccounts() {
  if (!leader.isLeader) return;
  try {
    const { data: dead } = await supabase
      .from("challenge_accounts")
      .select("account_id")
      .in("phase", ["failed", "paid_out"]);
    if (!dead?.length) return;
    const deadIds = new Set(dead.map(a => a.account_id).filter(Boolean));
    if (deadIds.size === 0) return;

    const { data: stranded } = await supabase
      .from("trades")
      .select("*")
      .in("status", ["open", "pending"])
      .in("account_id", [...deadIds]);
    if (!stranded?.length) return;

    console.warn(`[reconcile] Closing ${stranded.length} stranded trade(s) on failed/paid_out accounts`);
    const now = new Date().toISOString();
    for (const t of stranded) {
      const livePrice = getLatestPrice(t.symbol) ?? t.entry_price;
      const wasPending = t.status === "pending";
      const movePct = wasPending || !t.entry_price ? 0 : (livePrice - t.entry_price) / t.entry_price;
      const pnl     = wasPending ? 0 : (t.direction === "long" ? 1 : -1) * movePct * (t.size || 0);
      const margin  = t.leverage > 0 ? (t.size || 0) / t.leverage : (t.size || 0);
      const closeData = {
        status:     wasPending ? "cancelled" : "closed",
        exit_price: wasPending ? null : livePrice,
        pnl:        wasPending ? 0 : pnl,
        pnl_pct:    wasPending || margin <= 0 ? 0 : (pnl / margin) * 100,
        close_time: now,
      };
      removeFromCache(t.id);
      try {
        await Promise.all([
          workerUpdateTrade(base44, t.id, closeData).catch(() => {}),
          supabase.from("trades").update(closeData).eq("id", t.id),
        ]);
      } catch (err) {
        console.error(`[reconcile] Failed to close trade ${t.id}:`, err.message);
      }
    }
    console.warn(`[reconcile] Done`);
  } catch (err) {
    console.error("[reconcile] Sweep failed:", err.message);
  }
}

// ── Market-close enforcer ────────────────────────────────────────────────────
// Closes any open position whose underlying market is now closed. Runs every
// minute on the leader. Replaces the old client-side useMarketCloseEnforcer
// hook so closes can't be skipped or tampered with from the browser.

async function enforceMarketClose() {
  if (!leader.isLeader || !cacheReady) return;
  const now = new Date();
  const nowIso = now.toISOString();
  const closures = openTrades.filter(t => {
    if (t.status !== "open") return false;
    const klass = getAssetClass(t.symbol);
    if (!klass) return false;
    return !isMarketOpen(klass, now);
  });
  if (!closures.length) return;

  console.warn(`[market-close] Closing ${closures.length} position(s) on closed markets`);
  for (const t of closures) {
    const exitPrice = getLatestPrice(t.symbol) ?? t.entry_price;
    const movePct   = t.entry_price ? (exitPrice - t.entry_price) / t.entry_price : 0;
    const pnl       = (t.direction === "long" ? 1 : -1) * movePct * (t.size || 0);
    const margin    = t.leverage > 0 ? (t.size || 0) / t.leverage : (t.size || 0);
    const closeData = {
      status:       "closed",
      exit_price:   exitPrice,
      pnl,
      pnl_pct:      margin > 0 ? (pnl / margin) * 100 : 0,
      close_time:   nowIso,
      close_reason: "market_closed",
    };
    removeFromCache(t.id);
    try {
      await Promise.all([
        workerUpdateTrade(base44, t.id, closeData).catch(() => {}),
        supabase.from("trades").update(closeData).eq("id", t.id).throwOnError(),
      ]);

      // Recompute balance from ground truth (the trade is already `closed`
      // above) instead of an incremental += that can be lost — see persistCloseBalance.
      const acct = accountCache.get(t.account_id);
      if (acct) {
        const balanceBefore = acct.current_balance ?? 0;
        const balanceAfter = await persistCloseBalance({ base44, supabase, acct, pnl });
        // Ledger entry so the trade close is part of the immutable history
        await insertLedgerRow(supabase, {
          event_type:     "trade_close",
          account_id:     t.account_id,
          trader_address: acct.trader_address || "",
          trade_id:       t.id,
          symbol:         t.symbol,
          direction:      t.direction,
          size_usdc:      t.size,
          leverage:       t.leverage,
          entry_price:    t.entry_price,
          exit_price:     exitPrice,
          pnl_usdc:       pnl,
          close_reason:   "market_closed",
          opened_at:      t.open_time,
          closed_at:      nowIso,
          balance_before: balanceBefore,
          balance_after:  balanceAfter ?? 0,
        }).catch(err => console.error("[market-close] ledger insert failed:", err.message));
      }
    } catch (err) {
      console.error(`[market-close] Failed to close trade ${t.id}:`, err.message);
    }
  }
}

function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0
  ));
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();
  console.log(`[daily-reset] Next reset in ${(msUntilMidnight / 60_000).toFixed(1)} minutes (${nextMidnight.toISOString()})`);

  setTimeout(() => {
    resetDailyLoss();
    // Then repeat every 24h
    setInterval(resetDailyLoss, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// ── Price feeds ───────────────────────────────────────────────────────────────
// The worker holds every upstream connection and re-broadcasts ticks to the
// frontend, so traders read the exact prices the worker fills against and an
// exchange only ever sees the worker's IP. See docs/price-feeds.md.
//
// Binance covers crypto (sub-second, no credentials); eToro covers FX,
// commodities and stocks (~2-5s, authenticated). Both emit the same "price"
// event, so everything downstream is provider-agnostic.

const cryptoFeed = new BinancePriceFeed(CRYPTO_ASSETS);

const etoroAssets = [...FX_ASSETS, ...COMMODITY_ASSETS, ...STOCK_ASSETS];
const etoroFeed = new EtoroPriceFeed(etoroAssets, {
  userKey: process.env.ETORO_USER_KEY,
  apiKey: process.env.ETORO_API_KEY,
});

// ── Leader election (multi-region active-standby) ───────────────────────────
const leader = new LeaderElection(supabase);

// ── Zone Trading engine (funded mode) ──────────────────────────────────────
// 60-second Zone Trading bets settled against the authoritative worker price.
// Funded wins/losses are written as closed `trades` rows so the existing
// balance derivation + drawdown enforcement apply unchanged.
const zone = new ZoneTradesEngine({
  supabase,
  base44,
  accountCache,
  getLatestPrice,
  persistCloseBalance,
  getOpenTrades:    () => openTrades,
  getPendingOrders: () => pendingOrders,
});

// ── Discord bot (leader-only) ────────────────────────────────────────────────
const discordBot = new DiscordBot({ supabase });

// ── CFG event indexer (leader-only) ──────────────────────────────────────────
// Backfills + tails events from CFGDistributor and CFGLPRewards into
// `cfg_events`. Powers the leaderboard and any cross-address analytics.
const cfgIndexer = new CfgIndexer({
  rpcUrl:             process.env.RPC_URL,
  distributorAddress: process.env.CFG_DISTRIBUTOR_ADDRESS || process.env.VITE_CFG_DISTRIBUTOR_ADDRESS,
  lpRewardsAddress:   process.env.CFG_LP_REWARDS_ADDRESS  || process.env.VITE_CFG_LP_REWARDS_ADDRESS,
  poolAddress:        process.env.REWARDS_POOL_ADDRESS    || process.env.VITE_REWARDS_POOL_ADDRESS,
  fromBlock:          process.env.CFG_INDEXER_FROM_BLOCK,
});

// ── Payouts sync (leader-only) ───────────────────────────────────────────────
// Mirrors Base44's Payout entity into the Supabase `payouts` table so the
// Discord bot and other queries can read payouts without hitting Base44.
const payoutsSync = new PayoutsSync({ supabase, base44 });

// ── Community auto-feeds (leader-only) ───────────────────────────────────────
// Posts platform events (challenge buys, phase 2 / funded promotions,
// settled payouts, big trade closes) into the corresponding read-only
// community channels.
const communityFeeds = new CommunityFeeds({ supabase });

// ── Price monitoring (cross-reference + staleness detection) ─────────────────
const { PriceMonitor } = require("./priceMonitor");
const priceMonitor = new PriceMonitor();

priceMonitor.on("alert", (alert) => {
  const prefix = alert.level === "critical" ? "CRITICAL" : "WARNING";
  console.warn(`[PriceMonitor] ${prefix}: ${alert.message}`);
  if (leader.isLeader) {
    discordBot.postAlert(`**${prefix}**: ${alert.message}`).catch(() => {});
  }
});

priceMonitor.start();

function onTick(symbol, price, meta) {
  if (!cacheReady) return;
  // All instances receive prices and keep caches warm via real-time subscriptions,
  // but only the leader executes trades to prevent duplicate fills.
  if (!leader.isLeader) return;
  checkTick({ base44, supabase, symbol, price, meta, pendingOrders, openTrades, accountCache, removeFromCache });
}

function onPrice(source) {
  return ({ symbol, price, conf, publishTimeMs }) => {
    priceMonitor.recordPrice(symbol, price, source);
    discordBot.updatePrice(symbol, price);
    onTick(symbol, price, { conf, publishTimeMs });
  };
}

cryptoFeed.on("price", onPrice("binance"));
etoroFeed.on("price", onPrice("etoro"));

// Re-broadcast every tick to connected traders (GET /prices/stream). Attached
// separately from onPrice so a fanout fault can never interfere with execution.
const priceStream = new PriceBroadcaster().attach(cryptoFeed).attach(etoroFeed);

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`[worker] Starting ChainFunded position monitor`);
console.log(`[worker] base44: ${appId} @ ${appBaseUrl}`);
console.log(`[worker] region: ${leader.region} | id: ${leader.id}`);
console.log(`[worker] feeds: binance ${CRYPTO_ASSETS.length} crypto | etoro ${etoroAssets.length} fx+commodities+stocks`);

loadInitialCache().then(async () => {
  // All instances: subscribe to real-time and start the price feeds (keeps caches warm)
  subscribeRealtime();
  cryptoFeed.start();
  etoroFeed.start();
  // Begin daily batching of captured console output to worker_logs.
  logStore.start({ supabase });

  // HTTP API — lets the frontend open/close trades through the worker so
  // entry/exit prices always come from the worker's authoritative feed
  startServer({
    supabase,
    base44,
    state: {
      leader,
      accountCache,
      getOpenTrades:    () => openTrades,
      getPendingOrders: () => pendingOrders,
      removeFromCache,
      addTradeToCache:  addOrUpdate,
      getLatestPrice,
      getFreshPrice,
      prices: priceStream,
      zone,
    },
  });

  // Recover any pending zone bets (reserve in-window stake, refund overdue)
  zone.loadPending();

  // Register before starting election — onPromote fires inside leader.start()
  // so the callback must be in place before the first _tryAcquire() call.
  leader.onPromote(() => {
    console.log(`[worker] Leader duties activated — scheduling syncs and resets`);
    scheduleMidnightReset();
    reconcileFailedAccounts();
    enforceMarketClose();
    cfgIndexer.start();
    payoutsSync.start();
    communityFeeds.start();
    discordBot.start().catch(err => console.error("[discord] Failed to start:", err.message));
  });

  // Start leader election after callback is registered
  await leader.start();
});

// ── Heartbeat + periodic sync ────────────────────────────────────────────────

setInterval(() => {
  const role = leader.isLeader ? "LEADER" : "STANDBY";
  console.log(`[worker] heartbeat ${new Date().toISOString()} [${role}] — ${pendingOrders.length} pending, ${openTrades.length} open, ${accountCache.size} accounts`);
}, 60_000);

// Sync accounts to base44 every 60s (leader only)
setInterval(() => {
  if (leader.isLeader) syncAccountsToBase44();
}, 60_000);

// Pull new base44 accounts into Supabase every 60s (leader only). Catches
// the gap when the frontend's syncAccount() can't write to Supabase (RLS,
// network) — the account ends up trade-eligible within a minute.
setInterval(() => {
  if (leader.isLeader) syncAccountsFromBase44();
}, 60_000);

// Market-close enforcer — every 60s on the leader, plus once at promotion
// (handled below in the onPromote callback).
setInterval(() => {
  if (leader.isLeader) enforceMarketClose();
}, 60_000);

// Zone Trading settlement — every 1s on the leader. Settles each 60s bet
// against the latest authoritative worker price once its window elapses.
setInterval(() => {
  if (leader.isLeader && cacheReady) zone.settleDue();
}, 1_000);

// ── Cache refresh backstop (every 5 minutes) ────────────────────────────────
// Safety net against Supabase Realtime dropping events: periodically re-pull
// active accounts + open trades from Supabase and reconcile with the cache.
// Not required when Realtime is healthy, but prevents silent staleness when
// the subscription connection hiccups.
async function refreshCacheFromDb() {
  if (!cacheReady) return;
  try {
    const { data: accts } = await supabase
      .from("challenge_accounts")
      .select("*")
      .not("phase", "in", "(failed,paid_out)");
    const { data: open } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "open");
    const { data: pending } = await supabase
      .from("trades")
      .select("*")
      .eq("status", "pending");

    if (Array.isArray(accts)) {
      const seen = new Set();
      for (const acct of accts) {
        const keys = accountKeysFor(acct);
        if (keys.length === 0) continue;
        for (const k of keys) seen.add(k);
        setAccountInCache(acct);
      }
      // Remove accounts no longer present (e.g. failed/paid_out since last refresh)
      for (const key of [...accountCache.keys()]) {
        if (!seen.has(key)) accountCache.delete(key);
      }
    }
    if (Array.isArray(open))    openTrades    = open;
    if (Array.isArray(pending)) pendingOrders = pending;

    console.log(`[worker] Cache refreshed from DB — ${accountCache.size} accounts, ${openTrades.length} open, ${pendingOrders.length} pending`);
  } catch (err) {
    console.error("[worker] Cache refresh failed:", err.message);
  }
}
setInterval(() => {
  if (leader.isLeader) refreshCacheFromDb();
}, 5 * 60_000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`[worker] ${signal} — shutting down`);
  leader.stop();
  await discordBot.stop();
  cfgIndexer.stop();
  payoutsSync.stop();
  communityFeeds.stop();
  // Release leadership immediately so standby takes over without waiting for TTL
  if (leader.isLeader) {
    try {
      await supabase.from("worker_leader").update({ leader_id: "", last_heartbeat: "1970-01-01T00:00:00Z" }).eq("id", 1);
      console.log("[worker] Leadership released");
    } catch {}
  }
  priceStream.stop();
  cryptoFeed.destroy();
  etoroFeed.destroy();
  // Final flush so the session's logs land before the process exits.
  await logStore.stopAndFlush();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
