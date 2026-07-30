-- Stage 2e: ad placements become single-slot + time-bound.
--   1. Every ad now has an expiry timestamp.
--   2. A placement ("location") can have at most one ACTIVE ad at a time,
--      enforced at the database level so it can never be violated even by
--      concurrent requests, not just by application logic.

ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;

-- Only one row per placement may be is_active = TRUE at any moment.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_ad_per_placement
  ON advertisements (placement)
  WHERE is_active = TRUE;
