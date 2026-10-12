"use strict";

/**
 * worker/communityFeeds.js
 *
 * Posts platform events into community channels as `is_system=true`
 * messages. Mirrors the Discord bot's poll-from-Supabase pattern but
 * writes to community_messages instead of Discord channels.
 *
 *   - challenge_accounts INSERT       → #challenge-buys
 *   - challenge_accounts phase=phase_2 → #funded-traders
 *   - challenge_accounts phase=funded  → #funded-traders
 *   - payouts status=settled           → #payouts
 *   - trades status=closed AND
 *       |pnl_pct| >= COMMUNITY_BIG_TRADE_PCT_THRESHOLD
 *                                      → #share-trades (TradeShareCard)
 *
 * Cursor state lives in discord_cursor under "community_…" names so we
 * don't duplicate the bookkeeping table.
 */

const { createNotification } = require("./notifications");

const POLL_INTERVAL_MS = 30_000;
const POST_GAP_MS      = 100;
const BIG_TRADE_PCT    = parseFloat(process.env.COMMUNITY_BIG_TRADE_PCT_THRESHOLD || "5");

class CommunityFeeds {
  constructor({ supabase }) {
    this._supabase = supabase;
    this._timer    = null;
    this._stopped  = false;

    // account_id → last-known phase, seeded on first tick.
    this._phaseMemo = new Map();
    this._phaseMemoSeeded = false;
  }

  start() {
    if (this._timer) return;
    console.log(`[communityFeeds] Starting (${POLL_INTERVAL_MS / 1000}s interval)`);
    this._tick();
    this._timer = setInterval(() => this._tick(), POLL_INTERVAL_MS);
  }

  stop() {
    this._stopped = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _tick() {
    if (this._stopped) return;
    try {
      await this._seedPhaseMemoOnce();
      await Promise.allSettled([
        this._pollChallengesAndPhases(),
        this._pollPayouts(),
        this._pollBigTrades(),
      ]);
    } catch (err) {
      console.error("[communityFeeds] tick error:", err.message);
    }
  }

  async _seedPhaseMemoOnce() {
    if (this._phaseMemoSeeded) return;
    try {
      const { data } = await this._supabase
        .from("challenge_accounts")
        .select("account_id, phase");
      for (const r of (data || [])) {
        if (r.account_id) this._phaseMemo.set(r.account_id, r.phase || null);
      }
      this._phaseMemoSeeded = true;
      console.log(`[communityFeeds] phase memo seeded with ${this._phaseMemo.size} accounts`);
    } catch (err) {
      console.warn("[communityFeeds] phase memo seed failed:", err.message);
    }
  }

  // ── Cursors ──────────────────────────────────────────────────────────

  async _loadCursor(name, fallbackIso) {
    try {
      const { data } = await this._supabase
        .from("discord_cursor")
        .select("last_seen")
        .eq("name", `community_${name}`)
        .maybeSingle();
      if (data?.last_seen) return data.last_seen;
    } catch {}
    return fallbackIso;
  }

  async _saveCursor(name, iso) {
    try {
      await this._supabase
        .from("discord_cursor")
        .upsert({
          name: `community_${name}`,
          last_seen: iso,
          updated_at: new Date().toISOString(),
        }, { onConflict: "name" });
    } catch {}
  }

  // ── Posters ──────────────────────────────────────────────────────────

  async _post(channelId, kind, payload) {
    try {
      await this._supabase
        .from("community_messages")
        .insert({
          channel_id: channelId,
          author_address: null,
          content: null,
          is_system: true,
          system_payload: { kind, ...payload },
        });
    } catch (err) {
      console.warn(`[communityFeeds] post to #${channelId} failed:`, err.message);
    }
  }

  // ── Channel-buys + phase transitions ────────────────────────────────

  async _pollChallengesAndPhases() {
    if (!this._phaseMemoSeeded) return;
    const { data, error } = await this._supabase
      .from("challenge_accounts")
      .select("account_id, trader_address, account_size, phase")
      .limit(5000);
    if (error || !data) return;

    for (const row of data) {
      if (!row.account_id) continue;
      const phase = row.phase || null;
      const hadMemo = this._phaseMemo.has(row.account_id);
      const prev = this._phaseMemo.get(row.account_id);

      if (!hadMemo) {
        if (phase === "phase_1" || phase == null) {
          await this._post("challenge-buys", "challenge_buy", {
            trader: row.trader_address,
            account_size: Number(row.account_size) || 0,
            phase: "phase_1",
          });
          await new Promise((r) => setTimeout(r, POST_GAP_MS));
        }
      } else if (prev !== phase) {
        if (phase === "phase_2") {
          await this._post("funded-traders", "phase2", {
            trader: row.trader_address,
            account_size: Number(row.account_size) || 0,
          });
          if (row.trader_address) {
            createNotification(this._supabase, {
              recipient: row.trader_address,
              type: "phase_promotion",
              title: "Promoted to Phase 2",
              body: `Your $${(Number(row.account_size) || 0).toLocaleString()} account is now in Phase 2.`,
              link: "/TraderDashboard",
              payload: { accountId: row.account_id, phase: "phase_2", accountSize: Number(row.account_size) || 0 },
            }).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, POST_GAP_MS));
        } else if (phase === "funded") {
          await this._post("funded-traders", "funded", {
            trader: row.trader_address,
            account_size: Number(row.account_size) || 0,
          });
          if (row.trader_address) {
            createNotification(this._supabase, {
              recipient: row.trader_address,
              type: "phase_promotion",
              title: "You're funded",
              body: `Your $${(Number(row.account_size) || 0).toLocaleString()} account is live. Time to trade.`,
              link: "/TraderDashboard",
              payload: { accountId: row.account_id, phase: "funded", accountSize: Number(row.account_size) || 0 },
            }).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, POST_GAP_MS));
        }
      }

      this._phaseMemo.set(row.account_id, phase);
    }
  }

  // ── Settled payouts ─────────────────────────────────────────────────

  async _pollPayouts() {
    const cursor = await this._loadCursor("payouts", new Date().toISOString());
    const { data, error } = await this._supabase
      .from("payouts")
      .select("trader_address, gross_profit_usdc, trader_share_usdc, firm_share_usdc, status, settled_at")
      .eq("status", "settled")
      .gt("settled_at", cursor)
      .order("settled_at", { ascending: true })
      .limit(50);
    if (error || !data || data.length === 0) return;

    let maxSeen = cursor;
    for (const row of data) {
      await this._post("payouts", "payout", {
        trader: row.trader_address,
        gross_profit_usdc: Number(row.gross_profit_usdc) || 0,
        trader_share_usdc: Number(row.trader_share_usdc) || 0,
        firm_share_usdc:   Number(row.firm_share_usdc)   || 0,
      });
      if (row.trader_address) {
        const traderShare = Number(row.trader_share_usdc) || 0;
        createNotification(this._supabase, {
          recipient: row.trader_address,
          type: "payout",
          title: `Payout settled — $${traderShare.toFixed(2)}`,
          body: `Gross profit $${(Number(row.gross_profit_usdc) || 0).toFixed(2)} · 80% trader share`,
          link: "/TraderDashboard",
          payload: {
            grossProfitUsdc: Number(row.gross_profit_usdc) || 0,
            traderShareUsdc: traderShare,
            firmShareUsdc: Number(row.firm_share_usdc) || 0,
          },
        }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, POST_GAP_MS));
      if (row.settled_at && row.settled_at > maxSeen) maxSeen = row.settled_at;
    }
    if (maxSeen !== cursor) await this._saveCursor("payouts", maxSeen);
  }

  // ── Big closed trades ───────────────────────────────────────────────

  async _pollBigTrades() {
    const cursor = await this._loadCursor("big_trades", new Date().toISOString());
    // Pull recent closes; filter by |pnl_pct| in JS (Supabase doesn't have a
    // simple "abs(col) >=" predicate without an RPC).
    const { data, error } = await this._supabase
      .from("trades")
      .select("id, trader_address, symbol, direction, entry_price, exit_price, size, leverage, pnl, pnl_pct, status, open_time, close_time, order_type")
      .eq("status", "closed")
      .gt("close_time", cursor)
      .order("close_time", { ascending: true })
      .limit(50);
    if (error || !data || data.length === 0) return;

    let maxSeen = cursor;
    for (const t of data) {
      const pct = Math.abs(Number(t.pnl_pct) || 0);
      // Skip scale-out children (order_type "reduce") — otherwise one position
      // closed in N chunks would post N near-identical share cards.
      if (pct >= BIG_TRADE_PCT && t.order_type !== "reduce") {
        await this._post("share-trades", "trade_share", {
          symbol: t.symbol,
          direction: t.direction,
          entry_price: t.entry_price,
          exit_price: t.exit_price,
          size: t.size,
          leverage: t.leverage,
          pnl: t.pnl,
          pnl_pct: t.pnl_pct,
          open_time: t.open_time,
          close_time: t.close_time,
          auto: true,
        });
        await new Promise((r) => setTimeout(r, POST_GAP_MS));
      }
      if (t.close_time && t.close_time > maxSeen) maxSeen = t.close_time;
    }
    if (maxSeen !== cursor) await this._saveCursor("big_trades", maxSeen);
  }
}

module.exports = { CommunityFeeds };
