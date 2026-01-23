require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

const logger = require('./utils/logger');
const healthRoutes = require('./health/health.routes');
const ticketsRoutes = require('./api/routes/tickets.routes');

/**
 * Serveur principal du Ticket Generator Service
 */
class TicketGeneratorServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3004;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure les middlewares
   */
  setupMiddleware() {
    // Sécurité
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Sécurité contre les injections NoSQL
    this.app.use(mongoSanitize());

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        success: false,
        message: 'Trop de requêtes, veuillez réessayer plus tard',
        error: {
          code: 'RATE_LIMIT_EXCEEDED'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  /**
   * Configure les routes
   */
  setupRoutes() {
    // Route racine
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Ticket Generator Service',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // Routes de santé
    this.app.use('/health', healthRoutes);

    // Routes API
    this.app.use('/api/tickets', ticketsRoutes);

    // Route API racine
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'Ticket Generator API',
        version: process.env.npm_package_version || '1.0.0',
        endpoints: {
          tickets: '/api/tickets',
          health: '/health'
        },
        documentation: '/api/docs',
        timestamp: new Date().toISOString()
      });
    });

    // Route 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        error: {
          code: 'NOT_FOUND',
          path: req.originalUrl
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure la gestion des erreurs
   */
  setupErrorHandling() {
    // Gestionnaire d'erreurs global
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Ne pas envoyer le stack trace en production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      const errorResponse = {
        success: false,
        message: isDevelopment ? error.message : 'Erreur interne du serveur',
        error: {
          code: 'INTERNAL_SERVER_ERROR'
        },
        timestamp: new Date().toISOString()
      };

      if (isDevelopment) {
        errorResponse.error.stack = error.stack;
      }

      res.status(error.status || 500).json(errorResponse);
    });

    // Gestion des promesses rejetées non capturées
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.message || reason
      });
    });

    // Gestion des exceptions non capturées
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
      });
      
      // Arrêter le serveur proprement
      this.gracefulShutdown('SIGTERM');
    });

    // Gestion des signaux système
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Démarre le serveur
   */
  start() {
    this.server = this.app.listen(this.port, () => {
      logger.info(`Ticket Generator Service started successfully`, {
        port: this.port,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        pid: process.pid
      });
    });

    this.server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof this.port === 'string'
        ? 'Pipe ' + this.port
        : 'Port ' + this.port;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  }

  /**
   * Arrête proprement le serveur
   * @param {string} signal - Signal reçu
   */
  async gracefulShutdown(signal) {
    logger.info(`Graceful shutdown initiated by ${signal}`);

    try {
      // Arrêter d'accepter de nouvelles connexions
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Arrêter les queues Redis si présentes
      try {
        const batchService = require('./core/database/batch.service');
        await batchService.shutdown();
        logger.info('Redis queues shut down');
      } catch (error) {
        logger.error('Error shutting down Redis queues', {
          error: error.message
        });
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error.message
      });
      process.exit(1);
    }
  }
}

// Démarrer le serveur si ce fichier est exécuté directement
if (require.main === module) {
  const server = new TicketGeneratorServer();
  server.start();
}

module.exports = TicketGeneratorServer;
