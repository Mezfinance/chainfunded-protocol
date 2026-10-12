-- ChainFunded Community schema.
-- Idempotent — safe to re-run. Run once in the Supabase SQL editor before
-- deploying the community feature.
--
-- All tables enable RLS with NO write policies — every write goes through
-- the worker service-role key. Anon clients can SELECT for reads only.

-- ── community_profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_profiles (
  wallet_address text PRIMARY KEY,
  handle         text UNIQUE,                 -- alphanumeric + underscore, max 20
  is_private     boolean NOT NULL DEFAULT false,
  ban_until      timestamptz,                 -- platform-wide ban
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_profiles_read ON community_profiles;
CREATE POLICY community_profiles_read ON community_profiles FOR SELECT USING (true);

-- ── community_channels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_channels (
  id                 text PRIMARY KEY,        -- slug
  name               text NOT NULL,
  emoji              text,
  description        text,
  category           text NOT NULL DEFAULT 'talk',
  sort_order         int  NOT NULL DEFAULT 0,
  is_read_only       boolean NOT NULL DEFAULT false,
  is_admin_only      boolean NOT NULL DEFAULT false,
  slow_mode_seconds  int  NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_channels_read ON community_channels;
CREATE POLICY community_channels_read ON community_channels FOR SELECT USING (true);

-- ── community_messages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      text NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  author_address  text,                       -- nullable for system messages
  content         text,
  is_system       boolean NOT NULL DEFAULT false,
  system_payload  jsonb,
  reply_to        uuid REFERENCES community_messages(id) ON DELETE SET NULL,
  mentions        text[] NOT NULL DEFAULT '{}',
  pinned          boolean NOT NULL DEFAULT false,
  pinned_by       text,
  pinned_at       timestamptz,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_messages_channel_created_idx
  ON community_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_messages_author_idx
  ON community_messages(author_address, created_at DESC);
CREATE INDEX IF NOT EXISTS community_messages_pinned_idx
  ON community_messages(channel_id) WHERE pinned;

ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_messages_read ON community_messages;
CREATE POLICY community_messages_read ON community_messages FOR SELECT USING (true);

-- ── community_reactions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_reactions (
  message_id       uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  emoji            text NOT NULL,
  reactor_address  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, emoji, reactor_address)
);

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_reactions_read ON community_reactions;
CREATE POLICY community_reactions_read ON community_reactions FOR SELECT USING (true);

-- ── community_reads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_reads (
  wallet_address  text NOT NULL,
  channel_id      text NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, channel_id)
);

ALTER TABLE community_reads ENABLE ROW LEVEL SECURITY;
-- Reads are private to the wallet — anon SELECT not enabled (nothing public-facing).

-- ── community_flags ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_flags (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  reporter_address  text NOT NULL,
  reason            text,
  status            text NOT NULL DEFAULT 'pending',
  resolved_by       text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_flags_status_idx ON community_flags(status, created_at DESC);

ALTER TABLE community_flags ENABLE ROW LEVEL SECURITY;
-- Flag rows are mod-only — no anon SELECT.

-- ── community_mutes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_mutes (
  wallet_address  text NOT NULL,
  channel_id      text,                        -- null = global mute
  expires_at      timestamptz,                  -- null = permanent (until lifted)
  muted_by        text,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, channel_id)
);

ALTER TABLE community_mutes ENABLE ROW LEVEL SECURITY;

-- ── community_moderators ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_moderators (
  wallet_address  text PRIMARY KEY,
  granted_by      text,
  granted_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_moderators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_moderators_read ON community_moderators;
CREATE POLICY community_moderators_read ON community_moderators FOR SELECT USING (true);

-- ── community_terms_acceptances ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_terms_acceptances (
  wallet_address  text PRIMARY KEY,
  version         int NOT NULL,
  accepted_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_terms_acceptances ENABLE ROW LEVEL SECURITY;
-- Per-wallet — no anon SELECT.

-- ── community_rate_limits ────────────────────────────────────────────────
-- Rolling window counter; updated atomically by the worker.
CREATE TABLE IF NOT EXISTS community_rate_limits (
  wallet_address  text PRIMARY KEY,
  window_start    timestamptz NOT NULL,
  count           int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_rate_limits ENABLE ROW LEVEL SECURITY;

-- ── community_url_embeds (cache) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_url_embeds (
  url           text PRIMARY KEY,
  title         text,
  description   text,
  image_url     text,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_url_embeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_url_embeds_read ON community_url_embeds;
CREATE POLICY community_url_embeds_read ON community_url_embeds FOR SELECT USING (true);
