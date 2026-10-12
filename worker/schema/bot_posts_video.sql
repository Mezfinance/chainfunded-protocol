-- bot_posts video support: lets the same queue + admin UI handle both
-- the existing static cards and video posts (chainfunded-affiliate-pack
-- MP4s with Claude-generated captions).
--
-- Run in the Supabase SQL editor.

ALTER TABLE bot_posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_path text;          -- repo-relative path to the .mp4

-- Video posts have no rendered card, so the static-card columns become
-- nullable.
ALTER TABLE bot_posts
  ALTER COLUMN image_b64    DROP NOT NULL,
  ALTER COLUMN card_template DROP NOT NULL,
  ALTER COLUMN card_data    DROP NOT NULL;

-- Constraint: every row must carry at least one renderable asset.
ALTER TABLE bot_posts
  DROP CONSTRAINT IF EXISTS bot_posts_media_consistency,
  ADD  CONSTRAINT bot_posts_media_consistency CHECK (
    (media_type = 'image' AND image_b64    IS NOT NULL AND card_template IS NOT NULL)
    OR
    (media_type = 'video' AND video_path   IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS bot_posts_status_media_idx
  ON bot_posts(status, media_type, created_at);
