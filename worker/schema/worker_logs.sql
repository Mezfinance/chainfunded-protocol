-- worker_logs: durable, best-effort capture of the worker's console output.
--
-- Fly's runtime logs are a live tail only (nothing older than a few days
-- survives), so the worker buffers its console output and flushes it here on a
-- long interval (default 24h) and on shutdown — see worker/logStore.js. This is
-- an audit backstop, not a hot-path source of truth: the odd dropped line is
-- acceptable. The worker writes via the service-role key (bypasses RLS).
--
-- Run in the Supabase SQL editor before deploying the worker change.

CREATE TABLE IF NOT EXISTS worker_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts         timestamptz NOT NULL,           -- when the line was emitted
  level      text NOT NULL DEFAULT 'info',   -- info | warn | error
  line       text,                           -- formatted console message
  region     text,                           -- FLY_REGION of the emitting instance
  machine    text,                           -- FLY_MACHINE_ID / alloc id
  created_at timestamptz NOT NULL DEFAULT now()  -- when the batch was flushed
);

-- Audit queries are time-ranged and occasionally filtered by level/instance.
CREATE INDEX IF NOT EXISTS worker_logs_ts_idx     ON worker_logs(ts DESC);
CREATE INDEX IF NOT EXISTS worker_logs_level_idx  ON worker_logs(level) WHERE level <> 'info';
CREATE INDEX IF NOT EXISTS worker_logs_machine_idx ON worker_logs(machine, ts DESC);

-- No public access — operational logs are admin-only. RLS on with no policy
-- means the anon/auth roles see nothing; the worker's service-role key bypasses
-- RLS for inserts.
ALTER TABLE worker_logs ENABLE ROW LEVEL SECURITY;

-- Optional housekeeping: drop logs older than 90 days. Schedule via pg_cron if
-- available, otherwise run manually.
--   DELETE FROM worker_logs WHERE created_at < now() - interval '90 days';
