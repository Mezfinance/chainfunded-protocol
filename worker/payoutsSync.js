"use strict";

/**
 * payoutsSync — periodically mirrors the Base44 Payout entity into the
 * Supabase `payouts` table. Leader-only.
 *
 * Why: Base44 is the system of record for payouts (created when the trader
 * requests one, status-updated when settled), but the Discord bot and any
 * future analytics want a queryable Postgres mirror. Cheap to run since the
 * payout volume is tiny relative to trades.
 */

const POLL_INTERVAL_MS = 60_000;
const FETCH_LIMIT      = 200;

class PayoutsSync {
  constructor({ supabase, base44 }) {
    this._supabase = supabase;
    this._base44   = base44;
    this._timer    = null;
    this._stopped  = false;
  }

  start() {
    if (this._timer) return;
    console.log("[payoutsSync] Starting (60s interval)");
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
      const records = await this._base44.entities.Payout.list("-created_date", FETCH_LIMIT);
      const list = Array.isArray(records) ? records : [];
      if (list.length === 0) return;

      const rows = list.map((p) => {
        // Settled payouts should have an explicit settled_at; fall back to
        // updated_date for older records that didn't set the field.
        const settledAt =
          p.settled_at ||
          (p.status === "settled" ? (p.updated_date || p.created_date) : null);
        return {
          id:                 p.id,
          trader_address:     (p.trader_address || "").toLowerCase() || null,
          account_id:         p.account_id        ?? null,
          payout_id:          p.payout_id         ?? null,
          status:             p.status            ?? "pending",
          gross_profit_usdc:  p.gross_profit_usdc ?? null,
          trader_share_usdc:  p.trader_share_usdc ?? null,
          firm_share_usdc:    p.firm_share_usdc   ?? null,
          tx_hash:            p.tx_hash           ?? null,
          created_at:         p.created_date      ?? null,
          settled_at:         settledAt,
          updated_at:         new Date().toISOString(),
        };
      });

      const { error } = await this._supabase
        .from("payouts")
        .upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("[payoutsSync] upsert failed:", error.message);
      }
    } catch (err) {
      console.error("[payoutsSync] tick error:", err.message);
    }
  }
}

module.exports = { PayoutsSync };
