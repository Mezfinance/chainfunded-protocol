-- Table to cache fetched prop-trading discourse summaries from X.
-- Populated by the x-bot-discourse workflow (fetch-discourse.js).
-- Consumed by the x-bot batch generation (run.js).

CREATE TABLE IF NOT EXISTS bot_discourse (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  summary TEXT NOT NULL,
  handles_referenced JSONB,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_discourse_fetched_at
  ON bot_discourse(fetched_at DESC);

-- Clean up old rows (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_bot_discourse() RETURNS void AS $$
BEGIN
  DELETE FROM bot_discourse
  WHERE fetched_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
