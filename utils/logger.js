const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : isTest ? 'silent' : 'debug'),
  // In production we want plain JSON lines (what log aggregators/hosting
  // platforms expect). In development, pretty-print for a human reading the
  // terminal via the pino-pretty dev dependency. Tests get no transport at
  // all since they're silent by default anyway.
  transport: isProduction || isTest
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
      }
});

module.exports = logger;
