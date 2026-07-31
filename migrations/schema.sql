-- ============================================================================
-- Kalpavruksha Kalyana -- full database schema (single consolidated migration)
-- ============================================================================
-- This one file replaces the old sequence of schema.sql + 002_upgrade_features.sql
-- + 003_stage2_superadmin.sql + 004_biodata_upload.sql + 005_ad_slot_expiry.sql.
-- Those five files are kept only in migrations/archive/ for history -- do not
-- run them again.
--
-- Safe to run in either situation:
--   * Brand-new, empty Postgres database  -> creates everything from scratch.
--   * An existing database from any of the old individual migrations
--     (partially or fully applied) -> every statement is idempotent
--     (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / etc.), so re-running this
--     file just fills in whatever is missing and leaves existing data alone.
--
-- Works against any standard Postgres 13+ database -- Supabase, Neon, Railway,
-- Render Postgres, RDS, a local Postgres, etc. There is nothing Supabase-
-- specific in this file (file storage is handled separately by the app's
-- storage layer, not by this schema).
--
-- Run it with:
--   psql "$DATABASE_URL" -f migrations/schema.sql
-- or paste it into your provider's SQL editor (e.g. Supabase SQL Editor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  mobile_number VARCHAR(15) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- gender is required for role='user' (opposite-gender match rule); existing
-- rows created before this column existed will have gender = NULL and the
-- app prompts to fill it in on next login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10) NULL CHECK (gender IN ('male', 'female'));

-- ----------------------------------------------------------------------------
-- 2. PROFILES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  image_name VARCHAR(255) NOT NULL,
  religion VARCHAR(100) NOT NULL,
  caste VARCHAR(100) NOT NULL,
  subcaste VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  time_of_birth TIME NULL,
  language VARCHAR(100) NOT NULL,
  occupation VARCHAR(150) NOT NULL,
  annual_salary DECIMAL(12, 2) NOT NULL,
  father_name VARCHAR(100) NOT NULL,
  father_occupation VARCHAR(150) NOT NULL,
  father_salary DECIMAL(12, 2) NOT NULL,
  mother_name VARCHAR(100) NOT NULL,
  mother_occupation VARCHAR(150) NOT NULL,
  mother_salary DECIMAL(12, 2) NOT NULL,
  total_siblings INT NOT NULL DEFAULT 0,
  male_siblings INT NOT NULL DEFAULT 0,
  female_siblings INT NOT NULL DEFAULT 0,
  phone_number VARCHAR(15) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  assets TEXT NOT NULL,
  loans TEXT NULL,
  rashi VARCHAR(100) NOT NULL,
  nakshatra VARCHAR(100) NOT NULL,
  jathaka_pdf_name VARCHAR(255) NULL,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- married profiles are hidden from member-facing search/dashboard, but stay
-- visible to admin/super admin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20) NOT NULL DEFAULT 'unmarried'
  CHECK (marital_status IN ('unmarried', 'married'));
-- optional second profile photo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_name_2 VARCHAR(255) NULL;
-- bio-data PDF, separate from the jathaka document
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biodata_pdf_name VARCHAR(255) NULL;

-- ----------------------------------------------------------------------------
-- 3. INTERESTS
-- ----------------------------------------------------------------------------
-- is_saved and is_interested are independent flags: a member can save a
-- profile for later AND separately express interest in it. Each shows up in
-- its own tab on the "Saved Profiles" page.
CREATE TABLE IF NOT EXISTS interests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_saved_only BOOLEAN NOT NULL DEFAULT FALSE, -- retained for backward compatibility, no longer used by the app
  is_saved BOOLEAN NOT NULL DEFAULT FALSE,
  is_interested BOOLEAN NOT NULL DEFAULT FALSE,
  saved_at TIMESTAMP NULL,
  interested_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill for any pre-existing rows written before is_saved/is_interested
-- existed: rows previously written with is_saved_only = TRUE were "saved",
-- rows written with is_saved_only = FALSE were "interested". No-op on a
-- fresh database (no rows to touch).
UPDATE interests SET is_saved = TRUE, saved_at = created_at WHERE is_saved_only = TRUE AND NOT is_saved;
UPDATE interests SET is_interested = TRUE, interested_at = created_at WHERE is_saved_only = FALSE AND NOT is_interested;

-- ----------------------------------------------------------------------------
-- 4. ADVERTISEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad_title VARCHAR(100) NOT NULL,
  image_name VARCHAR(255) NOT NULL,
  placement VARCHAR(20) NOT NULL CHECK (placement IN ('top_banner', 'sidebar', 'home_middle', 'home_bottom', 'after_search')),
  target_url VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Every ad now has an expiry timestamp, and switches to Inactive on its own
-- once its time is up (enforced by the app, not the database).
--
-- IMPORTANT: this must be TIMESTAMPTZ, not TIMESTAMP. A plain TIMESTAMP has
-- no timezone attached, so comparing it against NOW() (which IS timezone-
-- aware) forces Postgres to guess a timezone using the session setting --
-- which may not match the timezone the Node process used when it wrote the
-- value. That mismatch is exactly what caused ads to stay active past their
-- real-world expiry time (by whatever offset separates the two timezones).
-- TIMESTAMPTZ stores an absolute instant, so the comparison is unambiguous
-- no matter what timezone the app server or DB session are running in.
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- Fixes already-deployed databases where the column was created as the old,
-- ambiguous TIMESTAMP type. Naive values are reinterpreted as UTC on
-- conversion (a reasonable default) -- only runs if the column still has
-- the old type, so it's safe to run repeatedly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'advertisements'
      AND column_name = 'expires_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE advertisements
      ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
  END IF;
END $$;

-- A placement ("location") can have at most one ACTIVE ad at a time, enforced
-- at the database level so it can never be violated even by concurrent
-- requests, not just by application logic.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_ad_per_placement
  ON advertisements (placement)
  WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 5. SUCCESS STORIES (editable from the Admin / Super Admin portal, shown on
--    the public home page instead of being hard-coded in the template)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS success_stories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  couple_names VARCHAR(150) NOT NULL,
  story_text TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed 3 starter stories so the home page isn't empty on a fresh install.
-- Safe to edit/delete from the Admin portal afterwards; skipped entirely if
-- the table already has any rows (e.g. on an upgrade of an existing site).
INSERT INTO success_stories (couple_names, story_text, display_order)
SELECT * FROM (VALUES
  ('Shivaraj & Basavi', 'We found each other within two months of registering. Our families connected instantly over shared values.', 1),
  ('Mallikarjun & Girija', 'The verification process gave both our families confidence right from the first conversation.', 2),
  ('Basavaraj & Veena', 'A simple, respectful platform that understood exactly what our community was looking for.', 3)
) AS seed_data(couple_names, story_text, display_order)
WHERE NOT EXISTS (SELECT 1 FROM success_stories);

-- ----------------------------------------------------------------------------
-- 6. CONTACT MESSAGES (home page "Get in touch" form -- previously discarded
--    with no persistence at all; now saved so enquiries are never silently
--    lost, and can be reviewed from the Super Admin portal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  mobile VARCHAR(15) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_unread ON contact_messages (is_read, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_marital_status ON profiles (marital_status);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles (full_name);
CREATE INDEX IF NOT EXISTS idx_interests_user ON interests (user_id);
CREATE INDEX IF NOT EXISTS idx_interests_profile ON interests (profile_id);
CREATE INDEX IF NOT EXISTS idx_advertisements_placement ON advertisements (placement, is_active);
CREATE INDEX IF NOT EXISTS idx_success_stories_active ON success_stories (is_active, display_order);

-- NOTE: the express-session table ("session") is created automatically by
-- connect-pg-simple at app startup (createTableIfMissing: true), so it is
-- intentionally not defined here.
