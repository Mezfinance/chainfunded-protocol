-- zone_trades: short-term Up/Down Zone Trading positions (funded mode MVP).
--
-- Each row is a position with a trader-chosen hold window (60–240s;
-- lock_at→settle_at). The entry price (strike_price) is the authoritative
-- Pyth print captured at placement; at settle_at — or on first touch of
-- ±t2_pct (sticky knockout) — it closes against the Pyth price. The |Δ|
-- (% move from strike) at close classifies into:
--
--   Near (|Δ| < t1_pct)        ±25% stake     symmetric
--   Mid  (t1 ≤ |Δ| < t2_pct)   ±50% stake     symmetric
--   Far  (|Δ| ≥ t2_pct)        +85% / −100%   asymmetric (house edge)
--
-- Funded P&L is written as a closed row in `trades` so it flows through
-- the existing balance derivation (current_balance = starting + Σ closed-trade
-- pnl) and drawdown enforcement.
--
-- Worker writes via the service-role key (bypasses RLS). The frontend reads
-- bet history through the worker (/zone/history), so no public read policy
-- is required. Realtime is enabled so the UI can react to settlements.
--
-- ── Migration from turbo_trades ────────────────────────────────────────────
-- This file is idempotent: if an existing `turbo_trades` table is found
-- (from the previous product naming) it is renamed to `zone_trades` along
-- with its indexes — all rows and data preserved. Otherwise the new table
-- is created from scratch. Safe to re-run.
--
-- Run in the Supabase SQL editor before deploying the worker change.

DO $$
BEGIN
  -- If the old table exists and the new one doesn't yet, rename it (preserves
  -- all rows + the t1_pct/t2_pct/settled_zone columns added in earlier passes).
  IF to_regclass('public.turbo_trades') IS NOT NULL
     AND to_regclass('public.zone_trades') IS NULL THEN
    ALTER TABLE turbo_trades RENAME TO zone_trades;
  END IF;

  -- Rename indexes for consistency (no-ops if they already carry the new name).
  IF to_regclass('public.turbo_trades_pending_idx') IS NOT NULL THEN
    ALTER INDEX turbo_trades_pending_idx RENAME TO zone_trades_pending_idx;
  END IF;
  IF to_regclass('public.turbo_trades_account_created_idx') IS NOT NULL THEN
    ALTER INDEX turbo_trades_account_created_idx RENAME TO zone_trades_account_created_idx;
  END IF;
  IF to_regclass('public.turbo_trades_trader_created_idx') IS NOT NULL THEN
    ALTER INDEX turbo_trades_trader_created_idx RENAME TO zone_trades_trader_created_idx;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS zone_trades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode            text NOT NULL DEFAULT 'funded',   -- 'funded' | 'tournament' (phase 2)
  account_id      text,                             -- challenge account (funded mode)
  trader_address  text NOT NULL DEFAULT '',
  tournament_id   uuid,                             -- phase 2
  symbol          text NOT NULL,
  direction       text NOT NULL,                    -- 'up' | 'down'
  stake           numeric NOT NULL,                 -- USDC margin / max loss
  leverage        numeric NOT NULL DEFAULT 1,       -- unused under the zone model; kept for compatibility
  strike_price    numeric NOT NULL,                 -- entry price (captured at lock)
  settle_price    numeric,                           -- exit price (at settle or early close)
  t1_pct          numeric,                           -- Near→Mid barrier (fractional move from strike)
  t2_pct          numeric,                           -- Mid→Far/KO barrier (fractional move from strike)
  lock_at         timestamptz NOT NULL DEFAULT now(),
  settle_at       timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending'|'win'|'loss'|'refund'|'exited'
  settled_zone    text,                              -- 'near' | 'mid' | 'far' | 'flat' (set at close)
  pnl             numeric,                           -- realised USDC (funded mode)
  trade_id        text,                              -- linked trades row (funded mode)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zone_trades_pending_idx
  ON zone_trades(settle_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS zone_trades_account_created_idx
  ON zone_trades(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS zone_trades_trader_created_idx
  ON zone_trades(trader_address, created_at DESC);

-- Safety net for tables created from earlier revisions of this file (covers
-- both the original turbo_trades schema and the in-place ALTERs we added
-- during the zone-trading rewrite).
ALTER TABLE zone_trades ADD COLUMN IF NOT EXISTS leverage numeric NOT NULL DEFAULT 1;
ALTER TABLE zone_trades ADD COLUMN IF NOT EXISTS t1_pct numeric;
ALTER TABLE zone_trades ADD COLUMN IF NOT EXISTS t2_pct numeric;
ALTER TABLE zone_trades ADD COLUMN IF NOT EXISTS settled_zone text;

ALTER TABLE zone_trades ENABLE ROW LEVEL SECURITY;
-- No public policies: all access is mediated by the worker (service role).
