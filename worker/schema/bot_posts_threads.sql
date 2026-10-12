-- bot_posts thread support: lets a single review-queue row hold a
-- multi-part thread. The first tweet/card lives in the existing
-- body/image_b64/card_data columns; parts 2..N live in thread_parts
-- as a JSON array. After posting, thread_tweet_ids stores the chain
-- of X tweet ids (main + each reply, in order).
--
-- Only thread_starter recipes generate threads (2-5 parts). Other
-- recipes leave is_thread=false and thread_parts=null.
--
-- Run in the Supabase SQL editor.

ALTER TABLE bot_posts
  ADD COLUMN IF NOT EXISTS is_thread        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS thread_parts     jsonb,
  ADD COLUMN IF NOT EXISTS thread_tweet_ids jsonb;

-- Sanity: thread rows must carry parts, single posts must not.
ALTER TABLE bot_posts
  DROP CONSTRAINT IF EXISTS bot_posts_thread_consistency,
  ADD  CONSTRAINT bot_posts_thread_consistency CHECK (
    (is_thread = false AND thread_parts IS NULL)
    OR
    (is_thread = true  AND jsonb_typeof(thread_parts) = 'array' AND jsonb_array_length(thread_parts) BETWEEN 1 AND 4)
  );
