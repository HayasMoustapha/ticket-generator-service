require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const logger = require('./utils/logger');
const healthRoutes = require('./health/health.routes');
const ticketsRoutes = require('./api/routes/tickets.routes');
const bootstrap = require("./bootstrap");

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

    // Logging
    this.app.use(morgan('combined'));
  }

  /**
   * Configure les routes
   */
  setupRoutes() {
    // Health check routes
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/tickets', ticketsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Ticket Generator Service',
        version: process.env.SERVICE_VERSION || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure la gestion des erreurs
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      
      res.status(err.status || 500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Démarre le serveur
   */
  async start() {
    try {
      // Bootstrap services
      await bootstrap();

      this.app.listen(this.port, () => {
        logger.info(`Ticket Generator Service started on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Démarrage du serveur
if (require.main === module) {
  const server = new TicketGeneratorServer();
  server.start().catch(error => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = TicketGeneratorServer;
