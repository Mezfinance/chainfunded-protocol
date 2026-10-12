-- discord_cursor: per-event-type "last seen" timestamp for the Discord poller.
-- Lets the bot resume after restart without re-posting historical events or
-- missing recent ones. Run in Supabase SQL editor before deploying the worker.

CREATE TABLE IF NOT EXISTS discord_cursor (
  name       text PRIMARY KEY,                       -- 'challenges' | 'payouts' | 'profit_claims'
  last_seen  timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker-only table. Service-role key bypasses RLS; anon/authenticated have
-- no access (no policies defined).
ALTER TABLE discord_cursor ENABLE ROW LEVEL SECURITY;
