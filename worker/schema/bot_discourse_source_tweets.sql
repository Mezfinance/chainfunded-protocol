-- bot_discourse source_tweets: stores the actual tweets that fed the
-- digest, so we can audit whether the summary is faithful and detect
-- drift if Claude starts paraphrasing too liberally.
--
-- Shape: jsonb array of { handle, text, url, created_at, metrics }.
--
-- Run in the Supabase SQL editor.

ALTER TABLE bot_discourse
  ADD COLUMN IF NOT EXISTS source_tweets jsonb;
