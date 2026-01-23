const winston = require('winston');
const path = require('path');

/**
 * Service de logging Winston configuré pour le Ticket Generator Service
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'ticket-generator',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Console transport pour le développement
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          return `${timestamp} [${service}] ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      )
    }),

    // File transport pour les logs d'erreur
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // File transport pour les logs combinés
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],

  // Gestion des exceptions non capturées
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'exceptions.log')
    })
  ],

  // Gestion des rejets de promesses non capturés
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'rejections.log')
    })
  ]
});

// Méthodes spécialisées pour différents types de logs
logger.auth = (message, meta = {}) => {
  logger.info(`[AUTH] ${message}`, { ...meta, category: 'auth' });
};

logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, { ...meta, category: 'security' });
};

logger.ticket = (message, meta = {}) => {
  logger.info(`[TICKET] ${message}`, { ...meta, category: 'ticket' });
};

logger.qrcode = (message, meta = {}) => {
  logger.info(`[QRCODE] ${message}`, { ...meta, category: 'qrcode' });
};

logger.pdf = (message, meta = {}) => {
  logger.info(`[PDF] ${message}`, { ...meta, category: 'pdf' });
};

logger.batch = (message, meta = {}) => {
  logger.info(`[BATCH] ${message}`, { ...meta, category: 'batch' });
};

logger.queue = (message, meta = {}) => {
  logger.info(`[QUEUE] ${message}`, { ...meta, category: 'queue' });
};

logger.performance = (message, meta = {}) => {
  logger.info(`[PERF] ${message}`, { ...meta, category: 'performance' });
};

logger.validation = (message, meta = {}) => {
  logger.warn(`[VALIDATION] ${message}`, { ...meta, category: 'validation' });
};

logger.external = (message, meta = {}) => {
  logger.info(`[EXTERNAL] ${message}`, { ...meta, category: 'external' });
};

module.exports = logger;
