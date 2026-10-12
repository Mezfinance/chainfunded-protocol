-- reviews — native, on-chain-verified trader reviews. See docs/reviews-spec.md.
--
-- Trust model: the reviewer is verified by the platform's on-chain-backed
-- records (owns a real challenge account; gold tier = has a settled payout),
-- and every review is wallet-signed (EIP-191) so it can't be silently edited.
-- One review per wallet (editable). Public read of published rows; all writes
-- are service-role only (the worker), consistent with the server-writes rule.

CREATE TABLE IF NOT EXISTS reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_address    text NOT NULL,                 -- lowercased wallet
  account_id        text,                          -- account used for verification
  rating            int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title             text NOT NULL CHECK (char_length(title) <= 90),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1500),
  display_name      text,                          -- ENS › handle › 0x… (resolved server-side)

  -- verification (computed server-side, never client-supplied)
  verification      text NOT NULL DEFAULT 'account'
                    CHECK (verification IN ('account','payout')),
  account_size      numeric,                       -- funded size for the badge
  payout_total_usdc numeric,                       -- total paid out (payout tier)
  payout_tx_hash    text,                          -- proof tx (payout tier)

  payout_id         text,                          -- on-chain replay key: settledPayouts[id]

  -- integrity (these let ANYONE re-derive the signer + content hash client-side)
  nonce             text,                          -- random per-signature nonce (signed)
  issued            bigint,                        -- ms timestamp (signed)
  signature         text NOT NULL,                 -- EIP-191 sig over the canonical payload
  content_hash      text NOT NULL,                 -- keccak256(canonical) — for re-verification

  -- moderation + curation
  status            text NOT NULL DEFAULT 'published'
                    CHECK (status IN ('published','hidden','flagged')),
  featured          boolean NOT NULL DEFAULT false,
  featured_rank     int,
  flagged_reason    text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (trader_address)                          -- one voice per wallet
);

-- Additive columns for existing installs (safe to re-run).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS payout_id text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS nonce     text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS issued    bigint;

CREATE INDEX IF NOT EXISTS reviews_published_idx ON reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_featured_idx  ON reviews (featured, featured_rank)
  WHERE featured AND status = 'published';

-- RLS: anyone may read PUBLISHED reviews; nobody writes via the anon/auth role
-- (the worker uses the service key, which bypasses RLS).
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reviews_read_published ON reviews;
CREATE POLICY reviews_read_published ON reviews
  FOR SELECT USING (status = 'published');
