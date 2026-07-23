// One-time seed script: creates the first Super Admin account.
// Run with: npm run seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../config/db');

async function seed() {
  const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const password = process.env.SUPERADMIN_PASSWORD || 'ChangeMe123';
  const mobile = process.env.SUPERADMIN_MOBILE || '9999999999';

  const [existing] = await query(
    "SELECT id FROM users WHERE username = ? OR role = 'superadmin' LIMIT 1",
    [username]
  );

  if (existing.length > 0) {
    console.log('A super admin already exists. Skipping seed.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);

  await query(
    `INSERT INTO users (name, mobile_number, username, password, role, status)
     VALUES (?, ?, ?, ?, 'superadmin', 'approved')`,
    ['Super Admin', mobile, username, hash]
  );

  console.log(`Super admin created. Username: ${username}  Password: ${password}`);
  console.log('Please log in at /portal/super-secure-login and change this password immediately.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
