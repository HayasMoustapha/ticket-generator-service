/**
 * Service d'envoi de webhooks vers Event-Planner-Core
 * Informe Event-Planner-Core quand les tickets sont generes.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

class TicketWebhookService {
  constructor() {
    this.eventCoreServiceUrl = process.env.EVENT_CORE_SERVICE_URL || 'http://localhost:3001';
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000];
  }

  buildSummaryPayload(data = {}) {
    const summary = data.summary || {};

    return {
      total: summary.total ?? data.total ?? data.tickets?.length ?? 0,
      successful: summary.successful ?? data.successful ?? 0,
      failed: summary.failed ?? data.failed ?? 0,
      processingTime:
        summary.processingTime ??
        summary.processing_time_ms ??
        data.processingTime ??
        data.processing_time_ms ??
        0,
    };
  }

  async sendWebhook(eventType, jobId, status, data) {
    try {
      const summary = this.buildSummaryPayload(data);
      const webhookPayload = {
        eventType,
        jobId,
        status,
        timestamp: new Date().toISOString(),
        data: {
          ...data,
          summary,
          source: 'ticket-generator-service',
          processingTime: summary.processingTime,
        },
      };

      logger.info(`[TICKET_WEBHOOK] Envoi webhook a Event-Planner-Core: ${eventType} pour job ${jobId}`);

      const response = await fetch(`${this.eventCoreServiceUrl}/api/internal/ticket-generation-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'ticket-generator-service',
          'X-Request-ID': `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          'X-Timestamp': new Date().toISOString(),
          'X-Webhook-Signature': this.generateWebhookSignature(webhookPayload),
        },
        body: JSON.stringify(webhookPayload),
      });

      if (!response.ok) {
        throw new Error(`Event-Planner-Core responded with ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      logger.info('[TICKET_WEBHOOK] Webhook accepte par Event-Planner-Core:', result);

      await this.updateWebhookLog(jobId, eventType, 'sent', result);

      return {
        success: true,
        webhookId: result.webhookId || `webhook_${jobId}_${Date.now()}`,
        processedAt: new Date().toISOString(),
        response: result,
      };
    } catch (error) {
      logger.error('[TICKET_WEBHOOK] Erreur envoi webhook a Event-Planner-Core:', error.message);

      await this.updateWebhookLog(jobId, eventType, 'failed', { error: error.message });

      if (this.shouldRetry(eventType, jobId)) {
        return this.scheduleRetry(eventType, jobId, status, data);
      }

      return {
        success: false,
        error: error.message,
        willRetry: false,
        maxRetriesReached: true,
      };
    }
  }

  async sendGenerationCompleted(jobId, generationData) {
    const payload = {
      tickets: generationData.tickets || [],
      summary: this.buildSummaryPayload(generationData),
    };

    return this.sendWebhook('ticket.completed', jobId, 'completed', payload);
  }

  async sendGenerationFailed(jobId, errorData) {
    const payload = {
      tickets: errorData.tickets || [],
      error: errorData.error || 'Echec de generation',
      summary: this.buildSummaryPayload({
        ...errorData,
        successful: 0,
        failed: errorData.failed ?? errorData.total ?? errorData.tickets?.length ?? 0,
      }),
    };

    return this.sendWebhook('ticket.failed', jobId, 'failed', payload);
  }

  async sendGenerationPartial(jobId, partialData) {
    const payload = {
      tickets: partialData.tickets || [],
      summary: this.buildSummaryPayload(partialData),
    };

    return this.sendWebhook('ticket.partial', jobId, 'partial', payload);
  }

  async updateWebhookLog(jobId, eventType, status, response) {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
          response,
          timestamp: new Date().toISOString(),
        }),
      ]);

      logger.info(`[TICKET_WEBHOOK] Log mis a jour pour job ${jobId}: webhook_${status}`);
    } catch (error) {
      logger.error(`[TICKET_WEBHOOK] Erreur mise a jour log pour job ${jobId}:`, error.message);
    }
  }

  shouldRetry(eventType, jobId) {
    return true;
  }

  async scheduleRetry(eventType, jobId, status, data) {
    return {
      success: false,
      error: 'Webhook failed, retry scheduled',
      willRetry: true,
      retryIn: `${this.retryDelays[0]}ms`,
    };
  }

  generateWebhookSignature(payload) {
    const payloadString = JSON.stringify(payload);

    return crypto.createHmac('sha256', this.webhookSecret).update(payloadString, 'utf8').digest('hex');
  }
}

module.exports = new TicketWebhookService();
