-- Kalpavruksha Kalyana — add Bio-Data PDF upload (separate from the jathaka document)
-- Run in Supabase SQL Editor (or psql) same as previous migrations.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biodata_pdf_name VARCHAR(255) NULL;
