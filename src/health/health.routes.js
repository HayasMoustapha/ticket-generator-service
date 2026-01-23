const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Routes de santé pour le Ticket Generator Service
 */

// GET /health - Health check simple
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ticket-generator',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/detailed - Health check détaillé
router.get('/detailed', async (req, res) => {
  try {
    const detailedStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ticket-generator',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid
      },
      dependencies: {
        redis: await checkRedisConnection(),
        database: await checkDatabaseConnection()
      }
    };

    res.status(200).json(detailedStatus);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/ready - Readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Vérifier que les dépendances critiques sont prêtes
    const redisReady = await checkRedisConnection();
    const databaseReady = await checkDatabaseConnection();
    
    const isReady = redisReady && databaseReady;
    
    const status = {
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisReady,
        database: databaseReady
      }
    };

    res.status(isReady ? 200 : 503).json(status);
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/live - Liveness probe
router.get('/live', (req, res) => {
  try {
    const livenessStatus = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };

    res.status(200).json(livenessStatus);
  } catch (error) {
    logger.error('Liveness check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'not alive',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Vérifie la connexion Redis
 * @returns {Promise<boolean>} True si connecté
 */
async function checkRedisConnection() {
  try {
    // Importer le service Redis si disponible
    // const redis = require('../config/redis');
    // await redis.ping();
    // return true;
    
    // Placeholder pour l'instant
    return true;
  } catch (error) {
    logger.error('Redis connection check failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Vérifie la connexion à la base de données
 * @returns {Promise<boolean>} True si connectée
 */
async function checkDatabaseConnection() {
  try {
    // Importer la configuration de la base de données
    // const database = require('../config/database');
    // await database.query('SELECT 1');
    // return true;
    
    // Placeholder pour l'instant
    return true;
  } catch (error) {
    logger.error('Database connection check failed', {
      error: error.message
    });
    return false;
  }
}

module.exports = router;
