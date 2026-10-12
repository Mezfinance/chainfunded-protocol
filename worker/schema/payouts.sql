-- payouts: mirror of Base44 Payout entity for off-chain analytics + Discord
-- notifications. Populated by worker/payoutsSync.js (leader only).
-- Run in Supabase SQL editor before deploying the worker.

CREATE TABLE IF NOT EXISTS payouts (
  id                 text PRIMARY KEY,             -- Base44 record id
  trader_address     text NOT NULL,
  account_id         text,                          -- on-chain accountId
  payout_id          text,                          -- on-chain payoutId
  status             text NOT NULL,                 -- pending | settled | failed | …
  gross_profit_usdc  numeric,
  trader_share_usdc  numeric,
  firm_share_usdc    numeric,
  tx_hash            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  settled_at         timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_status_idx     ON payouts(status);
CREATE INDEX IF NOT EXISTS payouts_settled_at_idx ON payouts(settled_at);
CREATE INDEX IF NOT EXISTS payouts_trader_idx     ON payouts(trader_address);

-- Lock the table down. The worker uses the service-role key
-- (SUPABASE_SERVICE_KEY) which bypasses RLS, so it can read and write freely.
-- Anon / authenticated clients have no access — payouts are surfaced to users
-- through Base44, not directly from Supabase.
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
