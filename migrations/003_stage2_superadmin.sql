-- Kalpavruksha Kalyana — Stage 2 upgrade migration
-- Safe to run against a database that already has schema.sql and
-- 002_upgrade_features.sql applied. Run with:
--   psql "$DATABASE_URL" -f migrations/003_stage2_superadmin.sql
--
-- Adds:
--   1. users.gender          — required for role='user' (opposite-gender match rule)
--   2. profiles.marital_status — 'unmarried' | 'married' (married profiles are hidden
--      from the member-facing search/dashboard, but stay visible to admin/super admin)
--   3. profiles.image_name_2 — optional second profile photo

-- 1. Users: gender
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10) NULL CHECK (gender IN ('male', 'female'));
-- Existing member (role='user') rows created before this migration will have
-- gender = NULL; the app will prompt to fill it in on next login if missing.

-- 2. Profiles: marital status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20) NOT NULL DEFAULT 'unmarried'
  CHECK (marital_status IN ('unmarried', 'married'));
CREATE INDEX IF NOT EXISTS idx_profiles_marital_status ON profiles (marital_status);

-- 3. Profiles: second photo (client asked for up to 2 images per profile)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_name_2 VARCHAR(255) NULL;

-- 4. Helpful index for admin name/keyword search on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles (full_name);
