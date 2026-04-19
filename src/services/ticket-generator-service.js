/**
 * Service principal du ticket-generator-service.
 * Ce service orchestre le cycle de vie de la generation de billets
 * et continue de servir les routes synchrones meme si Redis n'est
 * pas disponible en environnement local.
 */

const { startTicketGenerationConsumer } = require('../queues/ticket-generation-consumer');
const { createRedisClient, testRedisConnection } = require('../../../shared/config/redis-config');
const ticketQueueService = require('../core/queue/ticket-queue.service');

let serviceState = {
  isStarted: false,
  startTime: null,
  redisConnected: false,
  consumerStarted: false,
  degradedMode: false,
  redisClient: null,
  stats: {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    ticketsGenerated: 0,
    uptime: 0,
  },
};

function allowDegradedQueueMode() {
  return process.env.ALLOW_DEGRADED_QUEUE_MODE === 'true' || process.env.NODE_ENV !== 'production';
}

async function initializeTicketGeneratorService() {
  try {
    console.log('[TICKET_GENERATOR_SERVICE] Initialisation du service...');

    await ticketQueueService.initialize();
    console.log('[TICKET_GENERATOR_SERVICE] Service Redis Queue initialise');

    const redisClient = createRedisClient();
    await redisClient.connect();

    const redisConnected = await testRedisConnection(redisClient);
    if (!redisConnected) {
      throw new Error('Impossible de se connecter a Redis');
    }

    serviceState.redisClient = redisClient;
    serviceState.redisConnected = true;
    console.log('[TICKET_GENERATOR_SERVICE] Connexion Redis etablie');

    startTicketGenerationConsumer();
    serviceState.consumerStarted = true;
    console.log('[TICKET_GENERATOR_SERVICE] Consommateur demarre');

    serviceState.isStarted = true;
    serviceState.degradedMode = false;
    serviceState.startTime = new Date();

    console.log('[TICKET_GENERATOR_SERVICE] Service initialise avec succes');
    return true;
  } catch (error) {
    console.error('[TICKET_GENERATOR_SERVICE] Erreur initialisation:', error.message);

    if (!allowDegradedQueueMode()) {
      serviceState.isStarted = false;
      serviceState.degradedMode = false;
      return false;
    }

    console.warn('[TICKET_GENERATOR_SERVICE] Demarrage en mode degrade sans Redis Queue');
    serviceState.isStarted = true;
    serviceState.startTime = new Date();
    serviceState.redisConnected = false;
    serviceState.consumerStarted = false;
    serviceState.degradedMode = true;
    serviceState.redisClient = null;
    return true;
  }
}

async function shutdownTicketGeneratorService() {
  try {
    console.log('[TICKET_GENERATOR_SERVICE] Arret du service...');

    if (serviceState.redisClient && serviceState.redisConnected) {
      await serviceState.redisClient.quit();
      console.log('[TICKET_GENERATOR_SERVICE] Client Redis deconnecte');
    }

    if (ticketQueueService.isInitialized) {
      await ticketQueueService.shutdown();
      console.log('[TICKET_GENERATOR_SERVICE] Service Redis Queue arrete');
    }

    serviceState.isStarted = false;
    serviceState.consumerStarted = false;
    serviceState.redisConnected = false;
    serviceState.degradedMode = false;
    serviceState.redisClient = null;

    console.log('[TICKET_GENERATOR_SERVICE] Service arrete');
  } catch (error) {
    console.error("[TICKET_GENERATOR_SERVICE] Erreur lors de l'arret:", error.message);
  }
}

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
        status: serviceState.redisConnected ? 'healthy' : 'unavailable',
      },
      consumer: {
        started: serviceState.consumerStarted,
        status: serviceState.consumerStarted ? 'running' : 'stopped',
      },
      queueMode: {
        degraded: serviceState.degradedMode,
        status: serviceState.degradedMode ? 'degraded' : 'full',
      },
    },
    stats: {
      ...serviceState.stats,
      uptime,
    },
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    timestamp: now.toISOString(),
  };
}

function healthCheck() {
  const state = getServiceState();
  const isHealthy =
    state.status === 'running' &&
    (state.components.redis.connected || state.components.queueMode.degraded) &&
    (state.components.consumer.started || state.components.queueMode.degraded);

  return {
    status: isHealthy
      ? state.components.queueMode.degraded
        ? 'degraded'
        : 'healthy'
      : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: state.service,
    version: state.version,
    uptime: state.uptime_seconds,
    checks: {
      redis: state.components.redis,
      consumer: state.components.consumer,
      queueMode: state.components.queueMode,
    },
  };
}

function updateStats(type, value = 1) {
  if (Object.prototype.hasOwnProperty.call(serviceState.stats, type)) {
    serviceState.stats[type] += value;
  }
}

function getMetrics() {
  const state = getServiceState();

  return {
    service_metrics: {
      jobs_processed: state.stats.jobsProcessed,
      jobs_succeeded: state.stats.jobsSucceeded,
      jobs_failed: state.stats.jobsFailed,
      tickets_generated: state.stats.ticketsGenerated,
      success_rate:
        state.stats.jobsProcessed > 0
          ? Math.round((state.stats.jobsSucceeded / state.stats.jobsProcessed) * 100)
          : 0,
      uptime_seconds: state.uptime_seconds,
    },
    system_metrics: {
      memory_usage: state.memory_usage,
      cpu_usage: process.cpuUsage(),
      node_version: state.node_version,
    },
    timestamp: new Date().toISOString(),
  };
}

process.on('SIGTERM', async () => {
  console.log('[TICKET_GENERATOR_SERVICE] Signal SIGTERM recu, arret en cours...');
  await shutdownTicketGeneratorService();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[TICKET_GENERATOR_SERVICE] Signal SIGINT recu, arret en cours...');
  await shutdownTicketGeneratorService();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[TICKET_GENERATOR_SERVICE] Erreur non capturee:', error);
  shutdownTicketGeneratorService().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[TICKET_GENERATOR_SERVICE] Rejet non gere:', reason);
  console.error('[TICKET_GENERATOR_SERVICE] Promise:', promise);
});

module.exports = {
  initializeTicketGeneratorService,
  shutdownTicketGeneratorService,
  getServiceState,
  healthCheck,
  getMetrics,
  updateStats,
};
