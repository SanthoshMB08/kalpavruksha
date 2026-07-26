const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'Warning: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. ' +
    'File uploads (profiles, jathaka, biodata, ads) will fail until these are set in .env'
  );
}

// Service-role key is required (not the anon key): uploads happen from the
// server on behalf of admins/superadmins, and the buckets are private-write
// (public-read), so RLS would otherwise block every upload.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = supabaseAdmin;
