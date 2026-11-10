const app = require('./app');
const { pool } = require('./config/db');
const logger = require('./utils/logger');
const { cleanupUploads } = require('./utils/storageCleanup');

const PORT = process.env.PORT || 5000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let cleanupRunning = false;

const server = app.listen(PORT, () => {
  logger.info(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
  runStorageCleanup();
});

async function runStorageCleanup() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const result = await cleanupUploads(50);
    if (result.removed || result.failed) {
      logger.info({ ...result }, 'Scheduled stored-file cleanup completed');
    }
  } catch (err) {
    logger.error({ err }, 'Scheduled stored-file cleanup could not run');
  } finally {
    cleanupRunning = false;
  }
}

setInterval(runStorageCleanup, CLEANUP_INTERVAL_MS).unref();

// Graceful shutdown — drains in-flight requests and closes the MySQL pool
// cleanly instead of dropping connections mid-query on deploy/restart.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    pool.end().then(() => {
      logger.info('MySQL pool closed. Exiting.');
      process.exit(0);
    });
  });
  // Force-exit if shutdown hangs (e.g. a stuck connection)
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
