-- Leader election table for multi-region worker redundancy.
-- Run this in your Supabase SQL editor before deploying multi-region workers.

CREATE TABLE IF NOT EXISTS worker_leader (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  leader_id       text NOT NULL DEFAULT '',
  region          text NOT NULL DEFAULT '',
  last_heartbeat  timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton row
INSERT INTO worker_leader (id, leader_id)
VALUES (1, '')
ON CONFLICT DO NOTHING;

-- Optional: RPC for atomic claim (avoids race conditions under high concurrency)
CREATE OR REPLACE FUNCTION worker_claim_leader(
  p_leader_id text,
  p_region    text,
  p_cutoff    timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  UPDATE worker_leader
  SET    leader_id      = p_leader_id,
         region         = p_region,
         last_heartbeat = now()
  WHERE  id = 1
    AND  (last_heartbeat < p_cutoff OR leader_id = p_leader_id);

  v_claimed := FOUND;
  RETURN v_claimed;
END;
$$;
