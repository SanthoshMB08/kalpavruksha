-- Kalpavruksha Kalyana — upgrade migration
-- Safe to run against a database that already has the original schema.sql
-- applied. Adds: independent saved/interested flags, extra ad placements,
-- and the success_stories table. Run with:
--   psql "$DATABASE_URL" -f migrations/002_upgrade_features.sql

-- 1. Interests: split "save" and "express interest" into independent flags
ALTER TABLE interests ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE interests ADD COLUMN IF NOT EXISTS is_interested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE interests ADD COLUMN IF NOT EXISTS saved_at TIMESTAMP NULL;
ALTER TABLE interests ADD COLUMN IF NOT EXISTS interested_at TIMESTAMP NULL;

-- Backfill: rows previously written with is_saved_only = TRUE were "saved",
-- rows written with is_saved_only = FALSE were "interested".
UPDATE interests SET is_saved = TRUE, saved_at = created_at WHERE is_saved_only = TRUE AND NOT is_saved;
UPDATE interests SET is_interested = TRUE, interested_at = created_at WHERE is_saved_only = FALSE AND NOT is_interested;

-- 2. Advertisements: widen the allowed placement values
ALTER TABLE advertisements DROP CONSTRAINT IF EXISTS advertisements_placement_check;
ALTER TABLE advertisements ADD CONSTRAINT advertisements_placement_check
  CHECK (placement IN ('top_banner', 'sidebar', 'home_middle', 'home_bottom', 'after_search'));

-- 3. Success stories (new table)
CREATE TABLE IF NOT EXISTS success_stories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  couple_names VARCHAR(150) NOT NULL,
  story_text TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_success_stories_active ON success_stories (is_active, display_order);

-- Seed the 3 stories that used to be hard-coded in the homepage template, so
-- the home page isn't empty right after upgrading. Safe to edit/delete from
-- the Admin portal afterwards.
INSERT INTO success_stories (couple_names, story_text, display_order)
SELECT * FROM (VALUES
  ('Shivaraj & Basavi', 'We found each other within two months of registering. Our families connected instantly over shared values.', 1),
  ('Mallikarjun & Girija', 'The verification process gave both our families confidence right from the first conversation.', 2),
  ('Basavaraj & Veena', 'A simple, respectful platform that understood exactly what our community was looking for.', 3)
) AS seed_data(couple_names, story_text, display_order)
WHERE NOT EXISTS (SELECT 1 FROM success_stories);
