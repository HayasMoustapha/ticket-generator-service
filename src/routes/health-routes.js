/**
 * Routes de health check et monitoring pour ticket-generator-service
 * Ces routes permettent de monitorer l'Ã©tat du service et ses mÃ©triques
 * 
 * Routes :
 * GET /health - Health check simple
 * GET /health/detailed - Health check dÃ©taillÃ©
 * GET /metrics - MÃ©triques de performance
 * GET /status - Ã‰tat complet du service
 */

const express = require('express');
const router = express.Router();
const { healthCheck, getMetrics, getServiceState } = require('../services/ticket-generator-service');

/**
 * @route GET /health
 * @desc Health check simple du service
 * @access Public
 * @returns {Object} Ã‰tat de santÃ© basique
 */
router.get('/health', (req, res) => {
  try {
    const health = healthCheck();
    
    // Code HTTP basÃ© sur l'Ã©tat de santÃ©
    const isReachable = health.status === 'healthy' || health.status === 'degraded';
    const statusCode = isReachable ? 200 : 503;
    
    res.status(statusCode).json({
      success: isReachable,
      data: health,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[HEALTH_CHECK] Erreur:', error.message);
    res.status(503).json({
      success: false,
      error: 'Service unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /health/detailed
 * @desc Health check dÃ©taillÃ© avec tous les composants
 * @access Public
 * @returns {Object} Ã‰tat de santÃ© dÃ©taillÃ©
 */
router.get('/health/detailed', (req, res) => {
  try {
    const state = getServiceState();
    
    // DÃ©termination du statut global
    const isReachable =
      state.status === 'running' &&
      (state.components.redis.connected || state.components.queueMode.degraded) &&
      (state.components.consumer.started || state.components.queueMode.degraded);
    
    const statusCode = isReachable ? 200 : 503;
    
    res.status(statusCode).json({
      success: isReachable,
      data: state,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[HEALTH_DETAILED] Erreur:', error.message);
    res.status(503).json({
      success: false,
      error: 'Service unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /metrics
 * @desc MÃ©triques de performance et monitoring
 * @access Public
 * @returns {Object} MÃ©triques dÃ©taillÃ©es
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = getMetrics();
    
    res.status(200).json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[METRICS] Erreur:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve metrics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /status
 * @desc Ã‰tat complet du service (alias de /health/detailed)
 * @access Public
 * @returns {Object} Ã‰tat complet du service
 */
router.get('/status', (req, res) => {
  try {
    const state = getServiceState();
    
    res.status(200).json({
      success: true,
      data: state,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[STATUS] Erreur:', error.message);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve service status',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /ping
 * @desc Ping simple pour vÃ©rifier que le service rÃ©pond
 * @access Public
 * @returns {Object} Pong response
 */
router.get('/ping', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'pong',
    service: 'ticket-generator-service',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

