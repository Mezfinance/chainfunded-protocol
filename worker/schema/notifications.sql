-- notifications: in-app notification feed.
--
-- Source of truth for the bell dropdown. Worker writes via service-role
-- key (bypasses RLS); reads happen through the worker / Supabase realtime
-- subscription gated by recipient_address.
--
-- Run in the Supabase SQL editor before deploying the worker change.

CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_address text NOT NULL,
  type              text NOT NULL,
  title             text NOT NULL,
  body              text,
  link              text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications(recipient_address, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON notifications(recipient_address)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Public read so the supabase realtime channel can deliver INSERTs.
-- Anonymous clients only ever subscribe filtered by their own address;
-- the rest of the table is uninteresting to them but technically
-- readable. If that's not acceptable for your tenant, swap this for a
-- token-gated worker fetch (already implemented at /notifications/list).
DROP POLICY IF EXISTS notifications_read ON notifications;
CREATE POLICY notifications_read ON notifications
  FOR SELECT USING (true);

-- Realtime: the bell subscribes to INSERTs filtered by recipient_address
-- (see src/hooks/useNotifications.js). The table must be in the
-- supabase_realtime publication for those events to be delivered; without
-- this the bell only refreshes on its 30s poll. INSERT payloads carry the
-- full new row, so the default replica identity is sufficient for the
-- recipient filter (no REPLICA IDENTITY FULL needed unless we later listen
-- to UPDATE/DELETE filtered on non-PK columns).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
