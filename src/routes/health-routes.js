/**
 * Routes de health check et monitoring pour ticket-generator-service
 * Ces routes permettent de monitorer l'état du service et ses métriques
 * 
 * Routes :
 * GET /health - Health check simple
 * GET /health/detailed - Health check détaillé
 * GET /metrics - Métriques de performance
 * GET /status - État complet du service
 */

const express = require('express');
const router = express.Router();
const { healthCheck, getMetrics, getServiceState } = require('../services/ticket-generator-service');

/**
 * @route GET /health
 * @desc Health check simple du service
 * @access Public
 * @returns {Object} État de santé basique
 */
router.get('/health', (req, res) => {
  try {
    const health = healthCheck();
    
    // Code HTTP basé sur l'état de santé
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'healthy',
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
 * @desc Health check détaillé avec tous les composants
 * @access Public
 * @returns {Object} État de santé détaillé
 */
router.get('/health/detailed', (req, res) => {
  try {
    const state = getServiceState();
    
    // Détermination du statut global
    const isHealthy = state.status === 'running' && 
                     state.components.redis.connected && 
                     state.components.consumer.started;
    
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: isHealthy,
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
 * @desc Métriques de performance et monitoring
 * @access Public
 * @returns {Object} Métriques détaillées
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
 * @desc État complet du service (alias de /health/detailed)
 * @access Public
 * @returns {Object} État complet du service
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
 * @desc Ping simple pour vérifier que le service répond
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
