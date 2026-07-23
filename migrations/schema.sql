-- Kalpavruksha Kalyana database schema (PostgreSQL / Supabase)
-- Run this against your Supabase project's Postgres database, e.g. via the
-- Supabase SQL Editor, or: psql "$DATABASE_URL" -f migrations/schema.sql

-- 1. USERS
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

-- 2. PROFILES (images/PDFs stay on local disk under public/uploads/, only the
-- filenames are saved here — file storage is intentionally NOT migrated to
-- Supabase Storage)
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

-- 3. INTERESTS
CREATE TABLE IF NOT EXISTS interests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_saved_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. ADVERTISEMENTS
CREATE TABLE IF NOT EXISTS advertisements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad_title VARCHAR(100) NOT NULL,
  image_name VARCHAR(255) NOT NULL,
  placement VARCHAR(20) NOT NULL CHECK (placement IN ('top_banner', 'sidebar')),
  target_url VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interests_user ON interests (user_id);
CREATE INDEX IF NOT EXISTS idx_interests_profile ON interests (profile_id);
CREATE INDEX IF NOT EXISTS idx_advertisements_placement ON advertisements (placement, is_active);

-- NOTE: the express-session table ("session") is created automatically by
-- connect-pg-simple at app startup (createTableIfMissing: true), so it is
-- intentionally not defined here.
