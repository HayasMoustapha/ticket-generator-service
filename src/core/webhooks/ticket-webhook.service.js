/**
 * Service d'envoi de webhooks vers Event-Planner-Core
 * Informe Event-Planner-Core quand les tickets sont générés
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * Service de webhook pour Ticket-Generator
 */
class TicketWebhookService {
  constructor() {
    this.eventCoreServiceUrl = process.env.EVENT_CORE_SERVICE_URL || 'http://localhost:3001';
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
  }

  /**
   * Envoie un webhook à Event-Planner-Core
   * @param {string} eventType - Type d'événement
   * @param {number} jobId - ID du job de génération
   * @param {string} status - Statut de la génération
   * @param {Object} data - Données de génération
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendWebhook(eventType, jobId, status, data) {
    try {
      const webhookPayload = {
        eventType: eventType,
        jobId: jobId,
        status: status,
        timestamp: new Date().toISOString(),
        data: {
          ...data,
          source: 'ticket-generator-service',
          processingTime: data.processingTime || 0
        }
      };

      logger.info(`[TICKET_WEBHOOK] Envoi webhook à Event-Planner-Core: ${eventType} pour job ${jobId}`);

      const response = await fetch(`${this.eventCoreServiceUrl}/api/internal/ticket-generation-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'ticket-generator-service',
          'X-Request-ID': `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          'X-Timestamp': new Date().toISOString(),
          'X-Webhook-Signature': this.generateWebhookSignature(webhookPayload)
        },
        body: JSON.stringify(webhookPayload)
      });

      if (!response.ok) {
        throw new Error(`Event-Planner-Core responded with ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      logger.info(`[TICKET_WEBHOOK] Webhook accepté par Event-Planner-Core:`, result);

      // Mettre à jour les logs locaux
      await this.updateWebhookLog(jobId, eventType, 'sent', result);

      return {
        success: true,
        webhookId: result.webhookId || `webhook_${jobId}_${Date.now()}`,
        processedAt: new Date().toISOString(),
        response: result
      };

    } catch (error) {
      logger.error(`[TICKET_WEBHOOK] Erreur envoi webhook à Event-Planner-Core:`, error.message);

      // Mettre à jour les logs avec l'erreur
      await this.updateWebhookLog(jobId, eventType, 'failed', { error: error.message });

      // Programmer un retry si nécessaire
      if (this.shouldRetry(eventType, jobId)) {
        return this.scheduleRetry(eventType, jobId, status, data);
      }

      return {
        success: false,
        error: error.message,
        willRetry: false,
        maxRetriesReached: true
      };
    }
  }

  /**
   * Envoie un webhook de génération complétée
   * @param {number} jobId - ID du job
   * @param {Object} generationData - Données de génération
   */
  async sendGenerationCompleted(jobId, generationData) {
    const payload = {
      tickets: generationData.tickets || [],
      summary: {
        total: generationData.total || 0,
        successful: generationData.successful || 0,
        failed: generationData.failed || 0,
        processingTime: generationData.processingTime || 0
      }
    };

    return await this.sendWebhook('ticket.completed', jobId, 'completed', payload);
  }

  /**
   * Envoie un webhook de génération échouée
   * @param {number} jobId - ID du job
   * @param {Object} errorData - Données de l'erreur
   */
  async sendGenerationFailed(jobId, errorData) {
    const payload = {
      tickets: errorData.tickets || [],
      error: errorData.error || 'Échec de génération',
      summary: {
        total: errorData.total || 0,
        successful: 0,
        failed: errorData.total || 0,
        processingTime: errorData.processingTime || 0
      }
    };

    return await this.sendWebhook('ticket.failed', jobId, 'failed', payload);
  }

  /**
   * Envoie un webhook de génération partielle
   * @param {number} jobId - ID du job
   * @param {Object} partialData - Données partielles
   */
  async sendGenerationPartial(jobId, partialData) {
    const payload = {
      tickets: partialData.tickets || [],
      summary: {
        total: partialData.total || 0,
        successful: partialData.successful || 0,
        failed: partialData.failed || 0,
        processingTime: partialData.processingTime || 0
      }
    };

    return await this.sendWebhook('ticket.partial', jobId, 'partial', payload);
  }

  /**
   * Met à jour les logs de webhook dans la base de données locale
   * @param {number} jobId - ID du job
   * @param {string} eventType - Type d'événement
   * @param {string} status - Statut du webhook
   * @param {Object} response - Réponse du webhook
   */
  async updateWebhookLog(jobId, eventType, status, response) {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      const insertQuery = `
        INSERT INTO ticket_generation_logs 
        (job_id, status, message, details, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `;

      await pool.query(insertQuery, [
        jobId,
        `webhook_${status}`,
        `Webhook ${eventType} ${status}`,
        JSON.stringify({
          eventType,
          webhookStatus: status,
          response: response,
          timestamp: new Date().toISOString()
        })
      ]);

      logger.info(`[TICKET_WEBHOOK] Log mis à jour pour job ${jobId}: webhook_${status}`);

    } catch (error) {
      logger.error(`[TICKET_WEBHOOK] Erreur mise à jour log pour job ${jobId}:`, error.message);
      // Ne pas bloquer le flow principal
    }
  }

  /**
   * Vérifie si un retry doit être effectué
   * @param {string} eventType - Type d'événement
   * @param {number} jobId - ID du job
   * @returns {boolean} True si retry nécessaire
   */
  shouldRetry(eventType, jobId) {
    // Logique simple : toujours retryner jusqu'à maxRetries
    // Pourrait être amélioré avec un compteur de retry en base
    return true;
  }

  /**
   * Programme un retry de webhook
   * @param {string} eventType - Type d'événement
   * @param {number} jobId - ID du job
   * @param {string} status - Statut
   * @param {Object} data - Données
   * @returns {Promise<Object>} Résultat du retry programmé
   */
  async scheduleRetry(eventType, jobId, status, data) {
    // Pour l'instant, on retourne simplement l'info
    // Une implémentation complète utiliserait une queue de retry
    return {
      success: false,
      error: 'Webhook failed, retry scheduled',
      willRetry: true,
      retryIn: this.retryDelays[0] + 'ms'
    };
  }

  /**
   * Génère une signature pour le webhook
   * @param {Object} payload - Données du webhook
   * @returns {string} Signature HMAC-SHA256
   */
  generateWebhookSignature(payload) {
    const payloadString = JSON.stringify(payload);
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }
}

// Exportation d'une instance singleton
module.exports = new TicketWebhookService();
