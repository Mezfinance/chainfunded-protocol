-- Mirror Base44's ChallengeAccount.start_date into the Supabase
-- challenge_accounts table so the Discord bot's daily digest can count
-- "New Challenges (24h)" and /backfill can replay challenge buys within
-- a time window.
--
-- Base44 stores start_date as a date string (YYYY-MM-DD), set on the
-- frontend at payment success — see src/pages/Onboarding.jsx. Postgres
-- accepts the same string into a timestamptz (assumes midnight UTC).
--
-- Run this once in the Supabase SQL editor. Idempotent; safe to re-run.

-- 1. Add the column nullable so the ALTER doesn't fall back to per-row now().
ALTER TABLE challenge_accounts
  ADD COLUMN IF NOT EXISTS start_date timestamptz;

-- 2. Backdate any rows missing a value. Existing accounts have no start_date
--    in the mirror — the source of truth is Base44 — so epoch is a safe
--    sentinel that keeps them out of any "last N hours" window.
UPDATE challenge_accounts
   SET start_date = '1970-01-01T00:00:00Z'
 WHERE start_date IS NULL;

-- 3. Attach the default and tighten to NOT NULL for new inserts. Frontend
--    syncAccount() includes start_date for new buys; this default just
--    catches the edge case where it wasn't passed.
ALTER TABLE challenge_accounts
  ALTER COLUMN start_date SET DEFAULT now();

ALTER TABLE challenge_accounts
  ALTER COLUMN start_date SET NOT NULL;

-- 4. Index for the digest's "last 24h" count and /backfill range queries.
CREATE INDEX IF NOT EXISTS challenge_accounts_start_date_idx
  ON challenge_accounts(start_date);
