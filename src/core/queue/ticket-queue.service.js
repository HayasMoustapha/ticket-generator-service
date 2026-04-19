// ========================================
// 📄 IMPORTATIONS DES LIBRAIRIES
// ========================================
// Bull : Redis Queue pour la gestion des jobs asynchrones
const Queue = require('bull');
// IORedis : Client Redis pour la connexion
const IORedis = require('ioredis');
// Logger pour enregistrer les événements
const logger = require('../../utils/logger');
// Services de génération de tickets
const qrCodeService = require('../../core/qrcode/qrcode.service');
const pdfService = require('../../core/pdf/pdf.service');

function sanitizeRedisPassword(value) {
  if (!value) {
    return undefined;
  }

  const normalized = String(value).trim();
  if (!normalized || normalized.startsWith('your_')) {
    return undefined;
  }

  return normalized;
}

/**
 * 🎫 SERVICE DE COMMUNICATION REDIS QUEUE
 * Gère la communication asynchrone entre event-planner-core et ticket-generator
 * Assure la persistance, la reprise automatique et la résilience des messages
 */
class TicketQueueService {
  constructor() {
    // ========================================
    // 🔧 CONFIGURATION REDIS
    // ========================================
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: sanitizeRedisPassword(
        process.env.TICKET_GENERATION_QUEUE_PASSWORD || process.env.REDIS_PASSWORD,
      ),
      db: parseInt(process.env.TICKET_GENERATION_QUEUE_DB || process.env.REDIS_DB) || 4,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    // ========================================
    // 📋 CONFIGURATION DES QUEUES
    // ========================================
    this.queues = {
      // Queue principale pour les demandes de génération de tickets
      ticketGeneration: new Queue('TICKET_GENERATION', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 10,    // Garder 10 jobs complétés
          removeOnFail: 50,        // Garder 50 jobs échoués
          attempts: 3,             // 3 tentatives maximum
          backoff: {
            type: 'exponential',   // Backoff exponentiel
            delay: 2000           // Délai initial de 2 secondes
          }
        }
      }),

      // Queue pour les réponses de génération terminée
      ticketGenerated: new Queue('TICKET_GENERATED', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      }),

      // Queue Dead Letter pour les jobs échoués définitivement
      deadLetter: new Queue('TICKET_GENERATION_DLQ', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 100
        }
      })
    };

    this.isInitialized = false;
  }

  /**
   * Initialise les queues et les consumers
   * Doit être appelé au démarrage du service
   */
  async initialize() {
    try {
      logger.info('🚀 Initialisation du service Redis Queue...');

      // Connexion à Redis
      await this.connectRedis();

      // Configuration des consumers
      this.setupConsumers();

      // Configuration des gestionnaires d'événements
      this.setupEventHandlers();

      this.isInitialized = true;
      logger.info('✅ Service Redis Queue initialisé avec succès');
    } catch (error) {
      logger.error('❌ Erreur lors de l\'initialisation du service Redis Queue:', error);
      throw error;
    }
  }

  /**
   * Connexion à Redis
   */
  async connectRedis() {
    try {
      // Test de connexion Redis
      const redis = new IORedis(this.redisConfig);
      await redis.ping();
      await redis.quit();
      logger.info('🔗 Connexion Redis établie');
    } catch (error) {
      logger.error('❌ Impossible de se connecter à Redis:', error);
      throw new Error('Connexion Redis requise pour le service de queue');
    }
  }

  /**
   * Configure les consumers pour traiter les messages
   */
  setupConsumers() {
    if (process.env.ENABLE_LEGACY_TICKET_QUEUE_CONSUMER === 'true') {
    // ========================================
    // 🎫 CONSUMER: Génération de tickets
    // ========================================
    this.queues.ticketGeneration.process(async (job) => {
      const { eventId, correlationId, tickets, timestamp, sourceService } = job.data;
      
      logger.info('📨 Réception demande de génération de tickets', {
        eventId,
        correlationId,
        ticketCount: tickets.length,
        sourceService
      });

      try {
        // Traitement de chaque ticket individuellement
        const results = [];
        const errors = [];

        for (const ticket of tickets) {
          try {
            // Génération du QR code
            const qrResult = await qrCodeService.generateTicketQRCode(ticket, {
              format: 'base64',
              size: 'medium',
              includeLogo: false
            });

            if (!qrResult.success) {
              throw new Error(`QR generation failed: ${qrResult.error}`);
            }

            // Génération du PDF
            const pdfResult = await pdfService.generateTicketPDF(
              ticket,
              { id: ticket.eventId, name: 'Event Name', date: new Date().toISOString() },
              { id: ticket.userId, name: 'User Name', email: 'user@example.com' },
              { format: 'A4', orientation: 'portrait' }
            );

            if (!pdfResult.success) {
              throw new Error(`PDF generation failed: ${pdfResult.error}`);
            }

            // Ajout du résultat réussi
            results.push({
              ticketId: ticket.id,
              qrCode: qrResult.qrCode,
              checksum: qrResult.signature,
              pdfUrl: pdfResult.filename,
              generatedAt: new Date().toISOString()
            });

            logger.info('✅ Ticket généré avec succès', {
              ticketId: ticket.id,
              correlationId
            });

          } catch (ticketError) {
            // Erreur pour un ticket spécifique (ne bloque pas le batch)
            errors.push({
              ticketId: ticket.id,
              error: ticketError.message,
              timestamp: new Date().toISOString()
            });

            logger.error('❌ Erreur génération ticket', {
              ticketId: ticket.id,
              error: ticketError.message,
              correlationId
            });
          }
        }

        // Envoi de la réponse à event-planner-core
        await this.sendTicketGeneratedResponse({
          eventId,
          correlationId,
          results,
          errors,
          timestamp: new Date().toISOString(),
          sourceService: 'ticket-generator'
        });

        logger.info('📤 Réponse envoyée à event-planner-core', {
          eventId,
          correlationId,
          successCount: results.length,
          errorCount: errors.length
        });

        return {
          success: true,
          processed: results.length,
          errors: errors.length
        };

      } catch (error) {
        logger.error('❌ Erreur traitement batch de tickets', {
          eventId,
          correlationId,
          error: error.message
        });
        throw error;
      }
    });
    } else {
      logger.info('⏭️ Legacy ticket queue consumer disabled; dedicated generate-tickets worker is active', {
        version: '1.0.0'
      });
    }

    logger.info('👂 Consumers configurés');
  }

  /**
   * Configure les gestionnaires d'événements des queues
   */
  setupEventHandlers() {
    // ========================================
    // 📊 ÉVÉNEMENTS: Queue principale
    // ========================================
    this.queues.ticketGeneration.on('completed', (job, result) => {
      logger.info('✅ Job complété', {
        jobId: job.id,
        eventId: job.data.eventId,
        correlationId: job.data.correlationId,
        result
      });
    });

    this.queues.ticketGeneration.on('failed', (job, err) => {
      logger.error('❌ Job échoué', {
        jobId: job.id,
        eventId: job.data.eventId,
        correlationId: job.data.correlationId,
        error: err.message,
        attempts: job.attemptsMade
      });

      // Si toutes les tentatives ont échoué, déplacer vers Dead Letter Queue
      if (job.attemptsMade >= job.opts.attempts) {
        this.moveToDeadLetter(job, err);
      }
    });

    this.queues.ticketGeneration.on('stalled', (job) => {
      logger.warn('⚠️ Job stalled', {
        jobId: job.id,
        eventId: job.data.eventId,
        correlationId: job.data.correlationId
      });
    });

    logger.info('📡 Gestionnaires d\'événements configurés');
  }

  /**
   * Envoie une réponse de génération terminée à event-planner-core
   */
  async sendTicketGeneratedResponse(responseData) {
    try {
      await this.queues.ticketGenerated.add('TICKET_GENERATED', responseData, {
        priority: 1,
        delay: 0,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      });

      logger.info('📤 Réponse TICKET_GENERATED envoyée', {
        eventId: responseData.eventId,
        correlationId: responseData.correlationId
      });
    } catch (error) {
      logger.error('❌ Erreur envoi réponse TICKET_GENERATED', {
        eventId: responseData.eventId,
        correlationId: responseData.correlationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Déplace un job échoué vers la Dead Letter Queue
   */
  async moveToDeadLetter(job, error) {
    try {
      await this.queues.deadLetter.add('FAILED_JOB', {
        originalJobId: job.id,
        originalData: job.data,
        error: error.message,
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade
      });

      logger.warn('🪦 Job déplacé vers Dead Letter Queue', {
        jobId: job.id,
        eventId: job.data.eventId,
        correlationId: job.data.correlationId
      });
    } catch (dlqError) {
      logger.error('❌ Erreur déplacement vers Dead Letter Queue', {
        jobId: job.id,
        error: dlqError.message
      });
    }
  }

  /**
   * Obtient les statistiques des queues
   */
  async getQueueStats() {
    try {
      const stats = {};
      
      for (const [name, queue] of Object.entries(this.queues)) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        };
      }

      return stats;
    } catch (error) {
      logger.error('❌ Erreur récupération statistiques queues:', error);
      throw error;
    }
  }

  /**
   * Arrêt propre du service
   */
  async shutdown() {
    try {
      logger.info('🛑 Arrêt du service Redis Queue...');

      // Fermeture de toutes les queues avec gestion des erreurs
      const closePromises = [];
      for (const [name, queue] of Object.entries(this.queues)) {
        closePromises.push(
          queue.close()
            .then(() => logger.info(`✅ Queue ${name} fermée`))
            .catch(error => logger.error(`❌ Erreur fermeture queue ${name}:`, error.message))
        );
      }

      // Attendre que toutes les queues soient fermées
      await Promise.allSettled(closePromises);

      this.isInitialized = false;
      logger.info('✅ Service Redis Queue arrêté');
    } catch (error) {
      logger.error('❌ Erreur lors de l\'arrêt du service Redis Queue:', error);
      throw error;
    }
  }
}

// ========================================
// 📤 EXPORTATION DU SERVICE
// ========================================
module.exports = new TicketQueueService();
