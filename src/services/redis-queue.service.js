/**
 * Service Redis Queue pour Ticket-Generator
 * Reçoit les jobs de event-planner-core
 */

const Redis = require('ioredis');
const ticketGenerationService = require('./ticket-generation.service');

class RedisQueueService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.queueName = 'ticket-generation';
    this.responseQueueName = 'ticket-generation-response';
    
    this.setupEventHandlers();
  }

  /**
   * Configure les gestionnaires d'événements Redis
   */
  setupEventHandlers() {
    this.redis.on('connect', () => {
      console.log('[TICKET_GENERATOR_QUEUE] Connecté à Redis');
    });

    this.redis.on('error', (error) => {
      console.error('[TICKET_GENERATOR_QUEUE] Erreur Redis:', error);
    });
  }

  /**
   * Démarre le traitement des jobs
   */
  async startProcessing() {
    console.log('[TICKET_GENERATOR_QUEUE] Démarrage du traitement des jobs...');
    
    while (true) {
      try {
        const result = await this.redis.brpop(
          this.queueName,
          10 // Timeout de 10 secondes
        );

        if (result) {
          const [queue, message] = result;
          const jobMessage = JSON.parse(message);
          
          console.log(`[TICKET_GENERATOR_QUEUE] Job reçu: ${jobMessage.data.job_id}`);
          
          // Traiter le job
          await this.processJob(jobMessage);
        }
      } catch (error) {
        if (error.message !== 'Connection closed') {
          console.error('[TICKET_GENERATOR_QUEUE] Erreur traitement job:', error);
        }
      }
    }
  }

  /**
   * Traite un job de génération
   * @param {Object} jobMessage - Message du job
   */
  async processJob(jobMessage) {
    const startTime = Date.now();
    
    try {
      const { id, timestamp, service, data } = jobMessage;
      const { job_id, event_id, tickets, options } = data;

      // Envoyer le statut "processing"
      await this.sendResponse({
        job_id,
        status: 'processing',
        timestamp: new Date().toISOString()
      });

      // Traiter chaque ticket
      const results = [];
      for (const ticketData of tickets) {
        try {
          const result = await ticketGenerationService.generateTicket(
            ticketData,
            options
          );
          results.push(result);
        } catch (error) {
          console.error(`[TICKET_GENERATOR_QUEUE] Erreur génération ticket ${ticketData.ticket_id}:`, error);
          results.push({
            ticket_id: ticketData.ticket_id,
            success: false,
            error_message: error.message
          });
        }
      }

      // Calculer le résumé
      const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        processing_time: Date.now() - startTime
      };

      // Envoyer la réponse finale
      await this.sendResponse({
        job_id,
        status: 'completed',
        timestamp: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime,
        tickets: results,
        summary
      });

      console.log(`[TICKET_GENERATOR_QUEUE] Job ${job_id} terminé: ${summary.successful}/${summary.total} succès`);

    } catch (error) {
      console.error('[TICKET_GENERATOR_QUEUE] Erreur traitement job:', error);
      
      // Envoyer le statut d'erreur
      await this.sendResponse({
        job_id: jobMessage.data.job_id,
        status: 'failed',
        timestamp: new Date().toISOString(),
        processing_time_ms: Date.now() - startTime,
        tickets: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0
        }
      });
    }
  }

  /**
   * Envoie une réponse à event-planner-core
   * @param {Object} responseData - Données de réponse
   */
  async sendResponse(responseData) {
    try {
      const message = {
        id: `response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        service: 'ticket-generator',
        data: responseData
      };

      await this.redis.lpush(
        this.responseQueueName,
        JSON.stringify(message)
      );

      console.log(`[TICKET_GENERATOR_QUEUE] Réponse envoyée: ${responseData.job_id} - ${responseData.status}`);
    } catch (error) {
      console.error('[TICKET_GENERATOR_QUEUE] Erreur envoi réponse:', error);
    }
  }

  /**
   * Obtient les statistiques de la queue
   * @returns {Promise<Object>} Statistiques
   */
  async getQueueStats() {
    try {
      const length = await this.redis.llen(this.queueName);
      const responseLength = await this.redis.llen(this.responseQueueName);

      return {
        queueName: this.queueName,
        pendingJobs: length,
        pendingResponses: responseLength,
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      console.error('[TICKET_GENERATOR_QUEUE] Erreur stats:', error);
      return {
        queueName: this.queueName,
        pendingJobs: 0,
        pendingResponses: 0,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Ferme la connexion Redis
   */
  async disconnect() {
    await this.redis.quit();
    console.log('[TICKET_GENERATOR_QUEUE] Déconnecté de Redis');
  }
}

module.exports = new RedisQueueService();
