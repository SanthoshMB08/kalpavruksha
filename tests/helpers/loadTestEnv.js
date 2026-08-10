const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.test') });

if (process.env.NODE_ENV !== 'test') {
  throw new Error('.env.test did not set NODE_ENV=test — check .env.test exists and is loaded correctly.');
}
