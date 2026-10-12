-- bot_posts: queue + log for the X bot's auto-generated educational posts.
--
-- The x-bot runs on a schedule (GitHub Actions cron), generates a card +
-- tweet text via Claude, embeds the topic for novelty checks against
-- previous posts, and inserts a row here with status='pending_review'.
-- An admin approves / rejects in the Admin Dashboard; on approve the
-- worker (or a follow-up cron) publishes to X.
--
-- Run in the Supabase SQL editor before running the bot for the first
-- time. Requires the `vector` extension for embedding similarity search.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS bot_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         text NOT NULL,                  -- seed topic the post covers
  hook          text NOT NULL,                  -- first-line hook
  body          text NOT NULL,                  -- full tweet text (≤ 280 chars)
  card_template text NOT NULL,                  -- 'stat' | 'steps' | 'compare'
  card_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_b64     text NOT NULL,                  -- 1080x1080 PNG, base64
  embedding     vector(1536),                   -- topic + hook, OpenAI 3-small
  status        text NOT NULL DEFAULT 'pending_review',
                                                -- pending_review | approved | posted | rejected
  rejected_reason text,
  tweet_id      text,                           -- set after successful POST
  tweet_url     text,
  posted_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_posts_status_idx     ON bot_posts(status);
CREATE INDEX IF NOT EXISTS bot_posts_created_idx    ON bot_posts(created_at DESC);
-- IVFFlat index for cosine-similarity novelty checks. lists=100 is fine for
-- the volume we expect (a few thousand rows max in the first year).
CREATE INDEX IF NOT EXISTS bot_posts_embedding_idx
  ON bot_posts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE bot_posts ENABLE ROW LEVEL SECURITY;
-- Worker writes via service role (bypasses RLS); admin reads via worker
-- endpoint. No direct anon access.

-- Nearest-neighbour RPC for novelty checks. Returns the single closest
-- post by cosine distance within the lookback window, including only
-- posts whose status is not 'rejected' (rejected posts shouldn't block
-- a regenerated near-duplicate from being re-tried).
CREATE OR REPLACE FUNCTION bot_posts_nearest(
  query_embedding vector(1536),
  cutoff timestamptz
)
RETURNS TABLE (id uuid, topic text, distance float)
LANGUAGE sql STABLE
AS $$
  SELECT id, topic, (embedding <=> query_embedding)::float AS distance
  FROM bot_posts
  WHERE embedding IS NOT NULL
    AND status <> 'rejected'
    AND created_at > cutoff
  ORDER BY embedding <=> query_embedding
  LIMIT 1;
$$;
