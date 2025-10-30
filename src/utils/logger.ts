import winston from 'winston';
import path from 'path';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const logFile = process.env['LOG_FILE'] || 'logs/app.log';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Helper function to safely serialize objects, avoiding circular references
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (key === 'req' || key === 'res' || key === 'socket' || key === 'client') {
      return '[Circular]';
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, 2);
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length) {
      try {
        metaStr = safeStringify(meta);
      } catch (error) {
        metaStr = '[Unable to serialize meta]';
      }
    }
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