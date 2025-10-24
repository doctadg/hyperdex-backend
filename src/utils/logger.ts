import winston from 'winston';
import path from 'path';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const logFile = process.env['LOG_FILE'] || 'logs/app.log';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'hyperdex-backend' },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), logFile.replace('.log', '-error.log')),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), logFile),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

if (process.env['NODE_ENV'] !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

export default logger;