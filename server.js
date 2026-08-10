const app = require('./app');
const { pool } = require('./config/db');
const Advertisement = require('./models/Advertisement');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
});

// Ads also get swept lazily on every read (see Advertisement.deactivateExpired
// call sites), but this background timer makes expiry happen even on a quiet
// site with no visitors — an ad won't stay live past its expiry just because
// nobody hit a page that would've triggered the lazy sweep.
const AD_EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  Advertisement.deactivateExpired().catch((err) => {
    logger.error({ err }, 'Ad expiry sweep failed');
  });
}, AD_EXPIRY_SWEEP_INTERVAL_MS);

// Graceful shutdown — drains in-flight requests and closes the pg pool
// cleanly instead of dropping connections mid-query on deploy/restart.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    pool.end().then(() => {
      logger.info('Postgres pool closed. Exiting.');
      process.exit(0);
    });
  });
  // Force-exit if shutdown hangs (e.g. a stuck connection)
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
