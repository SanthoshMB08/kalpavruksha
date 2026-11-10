const app = require('./app');
const { pool } = require('./config/db');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
});

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
