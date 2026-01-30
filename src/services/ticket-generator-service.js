/**
 * Service principal du ticket-generator-service
 * Ce service orchestre le démarrage du consommateur Redis et gère le cycle de vie
 * du service de génération de billets
 * 
 * Principes :
- Démarrage automatique du consommateur au lancement
- Gestion gracieuse de l'arrêt
- Logs structurés pour monitoring
- Configuration centralisée
- Health checks pour monitoring
 */

const { startTicketGenerationConsumer } = require('../queues/ticket-generation-consumer');
const { createRedisClient, testRedisConnection } = require('../../../shared/config/redis-config');
const ticketQueueService = require('../core/queue/ticket-queue.service');

// État du service
let serviceState = {
  isStarted: false,
  startTime: null,
  redisConnected: false,
  consumerStarted: false,
  redisClient: null, // Ajout d'une référence au client Redis
  stats: {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    ticketsGenerated: 0,
    uptime: 0
  }
};

/**
 * Initialise le service de génération de billets
 * @returns {Promise<boolean>} True si l'initialisation réussie
 */
async function initializeTicketGeneratorService() {
  try {
    console.log('[TICKET_GENERATOR_SERVICE] Initialisation du service...');
    
    // Initialiser le service de queue Redis
    await ticketQueueService.initialize();
    console.log('[TICKET_GENERATOR_SERVICE] Service Redis Queue initialisé');
    
    // Test de connexion Redis
    const redisClient = createRedisClient();
    
    // Connecter le client Redis (nécessaire avec Redis v5)
    await redisClient.connect();
    
    const redisConnected = await testRedisConnection(redisClient);
    
    if (!redisConnected) {
      throw new Error('Impossible de se connecter à Redis');
    }
    
    // Stocker la référence au client Redis
    serviceState.redisClient = redisClient;
    serviceState.redisConnected = true;
    console.log('[TICKET_GENERATOR_SERVICE] Connexion Redis établie');
    
    // Démarrage du consommateur
    startTicketGenerationConsumer();
    serviceState.consumerStarted = true;
    console.log('[TICKET_GENERATOR_SERVICE] Consommateur démarré');
    
    // Mise à jour de l'état du service
    serviceState.isStarted = true;
    serviceState.startTime = new Date();
    
    console.log('[TICKET_GENERATOR_SERVICE] Service initialisé avec succès');
    console.log('[TICKET_GENERATOR_SERVICE] Prêt à traiter les jobs de génération de billets');
    
    return true;
    
  } catch (error) {
    console.error('[TICKET_GENERATOR_SERVICE] Erreur initialisation:', error.message);
    serviceState.isStarted = false;
    return false;
  }
}

/**
 * Arrête gracieusement le service
 * @returns {Promise<void>}
 */
async function shutdownTicketGeneratorService() {
  try {
    console.log('[TICKET_GENERATOR_SERVICE] Arrêt du service...');
    
    // Déconnexion du client Redis si connecté
    if (serviceState.redisClient && serviceState.redisConnected) {
      await serviceState.redisClient.quit();
      console.log('[TICKET_GENERATOR_SERVICE] Client Redis déconnecté');
    }
    
    // Arrêt du service de queue
    if (ticketQueueService.isInitialized) {
      await ticketQueueService.shutdown();
      console.log('[TICKET_GENERATOR_SERVICE] Service Redis Queue arrêté');
    }
    
    serviceState.isStarted = false;
    serviceState.consumerStarted = false;
    serviceState.redisConnected = false;
    serviceState.redisClient = null;
    
    console.log('[TICKET_GENERATOR_SERVICE] Service arrêté');
    
  } catch (error) {
    console.error('[TICKET_GENERATOR_SERVICE] Erreur lors de l\'arrêt:', error.message);
  }
}

/**
 * Récupère l'état actuel du service
 * @returns {Object} État détaillé du service
 */
function getServiceState() {
  const now = new Date();
  const uptime = serviceState.startTime ? Math.floor((now - serviceState.startTime) / 1000) : 0;
  
  return {
    service: 'ticket-generator-service',
    version: process.env.npm_package_version || '1.0.0',
    status: serviceState.isStarted ? 'running' : 'stopped',
    uptime_seconds: uptime,
    started_at: serviceState.startTime,
    components: {
      redis: {
        connected: serviceState.redisConnected,
        status: serviceState.redisConnected ? 'healthy' : 'unhealthy'
      },
      consumer: {
        started: serviceState.consumerStarted,
        status: serviceState.consumerStarted ? 'running' : 'stopped'
      }
    },
    stats: {
      ...serviceState.stats,
      uptime: uptime
    },
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    timestamp: now.toISOString()
  };
}

/**
 * Health check endpoint
 * @returns {Object} État de santé du service
 */
function healthCheck() {
  const state = getServiceState();
  
  const isHealthy = state.status === 'running' && 
                   state.components.redis.connected && 
                   state.components.consumer.started;
  
  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: state.service,
    version: state.version,
    uptime: state.uptime_seconds,
    checks: {
      redis: state.components.redis,
      consumer: state.components.consumer
    }
  };
}

/**
 * Met à jour les statistiques du service
 * @param {string} type - Type de statistique à mettre à jour
 * @param {number} value - Valeur à ajouter
 */
function updateStats(type, value = 1) {
  if (serviceState.stats.hasOwnProperty(type)) {
    serviceState.stats[type] += value;
  }
}

/**
 * Récupère les métriques pour monitoring
 * @returns {Object} Métriques détaillées
 */
function getMetrics() {
  const state = getServiceState();
  
  return {
    service_metrics: {
      jobs_processed: state.stats.jobsProcessed,
      jobs_succeeded: state.stats.jobsSucceeded,
      jobs_failed: state.stats.jobsFailed,
      tickets_generated: state.stats.ticketsGenerated,
      success_rate: state.stats.jobsProcessed > 0 ? 
        Math.round((state.stats.jobsSucceeded / state.stats.jobsProcessed) * 100) : 0,
      uptime_seconds: state.uptime_seconds
    },
    system_metrics: {
      memory_usage: state.memory_usage,
      cpu_usage: process.cpuUsage(),
      node_version: state.node_version
    },
    timestamp: new Date().toISOString()
  };
}

// Gestion de l'arrêt gracieux du processus
process.on('SIGTERM', async () => {
  console.log('[TICKET_GENERATOR_SERVICE] Signal SIGTERM reçu, arrêt en cours...');
  await shutdownTicketGeneratorService();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[TICKET_GENERATOR_SERVICE] Signal SIGINT reçu, arrêt en cours...');
  await shutdownTicketGeneratorService();
  process.exit(0);
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('[TICKET_GENERATOR_SERVICE] Erreur non capturée:', error);
  shutdownTicketGeneratorService().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[TICKET_GENERATOR_SERVICE] Rejet non géré:', reason);
  console.error('[TICKET_GENERATOR_SERVICE] Promise:', promise);
});

module.exports = {
  initializeTicketGeneratorService,
  shutdownTicketGeneratorService,
  getServiceState,
  healthCheck,
  getMetrics,
  updateStats
};
