// ========================================
// 📄 IMPORTATIONS DES LIBRAIRIES
// ========================================
// Express : Framework pour créer des routes web
const express = require('express');
// Service de queue pour la communication asynchrone
const ticketQueueService = require('../../core/queue/ticket-queue.service');
// Logger pour enregistrer les événements
const logger = require('../../utils/logger');

// Router : Objet Express pour gérer les routes
const router = express.Router();

/**
 * 📊 ROUTES POUR LE MONITORING DES QUEUES
 * Ces routes permettent de surveiller l'état des queues Redis
 * et de diagnostiquer les problèmes de communication asynchrone
 */

// ========================================
// 📈 ROUTE: Statistiques des queues
// ========================================
// GET /api/queues/stats - Retourne les statistiques de toutes les queues
router.get('/stats', async (req, res) => {
  try {
    // Récupération des statistiques de toutes les queues
    const stats = await ticketQueueService.getQueueStats();
    
    logger.info('📊 Statistiques des queues demandées', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Retour des statistiques avec succès
    return res.status(200).json({
      success: true,
      message: 'Queue statistics retrieved successfully',
      data: {
        queues: stats,
        timestamp: new Date().toISOString(),
        service: 'ticket-generator'
      }
    });
  } catch (error) {
    logger.error('❌ Erreur récupération statistiques queues', {
      error: error.message,
      ip: req.ip
    });

    // Retour d'erreur
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue statistics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// 🏥 ROUTE: Santé des queues
// ========================================
// GET /api/queues/health - Vérifie si les queues sont fonctionnelles
router.get('/health', async (req, res) => {
  try {
    // Vérification que le service de queue est initialisé
    if (!ticketQueueService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Queue service not initialized',
        message: 'Le service de queue n\'est pas initialisé',
        timestamp: new Date().toISOString()
      });
    }

    // Récupération des statistiques pour vérifier la santé
    const stats = await ticketQueueService.getQueueStats();
    
    // Vérification qu'il n'y a pas trop de jobs en erreur
    const totalFailed = Object.values(stats).reduce((sum, queue) => sum + queue.failed, 0);
    const isHealthy = totalFailed < 100; // Seuil de 100 jobs échoués

    const statusCode = isHealthy ? 200 : 503;
    const status = isHealthy ? 'healthy' : 'degraded';

    return res.status(statusCode).json({
      success: isHealthy,
      message: `Queue service is ${status}`,
      data: {
        status,
        stats,
        totalFailed,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('❌ Erreur vérification santé queues', {
      error: error.message,
      ip: req.ip
    });

    return res.status(503).json({
      success: false,
      error: 'Queue health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// 🔄 ROUTE: Redémarrage des queues (admin)
// ========================================
// POST /api/queues/restart - Redémarre le service de queue (admin uniquement)
router.post('/restart', async (req, res) => {
  try {
    logger.warn('🔄 Demande de redémarrage des queues', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Arrêt du service de queue
    await ticketQueueService.shutdown();
    
    // Pause pour permettre une fermeture propre
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Redémarrage du service de queue
    await ticketQueueService.initialize();

    logger.info('✅ Service de queue redémarré avec succès');

    return res.status(200).json({
      success: true,
      message: 'Queue service restarted successfully',
      data: {
        restartedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('❌ Erreur redémarrage service de queue', {
      error: error.message,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Queue service restart failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// 📤 EXPORTATION DU ROUTER
// ========================================
module.exports = router;
