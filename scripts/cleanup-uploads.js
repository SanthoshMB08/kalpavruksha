require('dotenv').config();
const { cleanupUploads } = require('../utils/storageCleanup');
const { pool } = require('../config/db');
cleanupUploads().then(result => console.log(result)).catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
