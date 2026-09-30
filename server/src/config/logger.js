const winston = require('winston');
const env = require('./env');

const logger = winston.createLogger({
  level: env.isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.isProd
      ? winston.format.json()
      : winston.format.printf(({ level, message, timestamp, stack }) =>
          `${timestamp} [${level.toUpperCase()}] ${stack || message}`),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
