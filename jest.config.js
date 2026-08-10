module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,
  // Tests share one Postgres database and truncate tables between files —
  // running files in parallel workers would race on shared tables (one
  // file's TRUNCATE wiping data another file is mid-assertion on). This is
  // an integration suite hitting a real DB, not isolated unit tests, so
  // serial execution is the correct trade-off here, not a performance bug.
  maxWorkers: 1,
  setupFiles: ['<rootDir>/tests/helpers/loadTestEnv.js'],
  testMatch: ['**/tests/**/*.test.js']
};
