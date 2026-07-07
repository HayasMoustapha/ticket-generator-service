const Queue = require('bull');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const { database } = require('../../config/database');

/**
 * Service de traitement par lots pour les tickets
 * Gère les jobs de génération en masse avec Redis Queue
 */
class BatchService {
  constructor() {
    this.queues = new Map();
    this.isInitialized = false;
    this.jobOptions = {
      removeOnComplete: parseInt(process.env.QUEUE_DEFAULT_JOB_OPTIONS_REMOVE_ON_COMPLETE) || 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    };
    
    // Ne plus initialiser les queues immédiatement
    // this.initializeQueues();
  }

  /**
   * Initialise les queues Redis (appelé à la demande)
   */
  async initializeQueues() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: parseInt(process.env.QUEUE_REDIS_URL?.split('/')[3]) || 2
      };
      
      // Ajouter le mot de passe seulement s'il est défini
      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }
      
      console.log('🔗 Initializing Redis queues with config:', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
        hasPassword: !!redisConfig.password
      });
      
      // Queue pour la génération de tickets
      this.queues.set('ticket-generation', new Queue('ticket generation', {
        redis: redisConfig,
        defaultJobOptions: this.jobOptions
      }));

      // Queue pour la génération PDF
      this.queues.set('pdf-generation', new Queue('pdf generation', {
        redis: redisConfig,
        defaultJobOptions: this.jobOptions
      }));

      // Queue pour le traitement batch
      this.queues.set('batch-processing', new Queue('batch processing', {
        redis: redisConfig,
        defaultJobOptions: this.jobOptions
      }));

      // Configuration des workers
      this.setupWorkers();
      
      logger.info('Batch queues initialized successfully', {
        queues: Array.from(this.queues.keys())
      });
      
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize batch queues', {
        error: error.message
      });
    }
  }

  /**
   * Configure les workers pour traiter les jobs
   */
  setupWorkers() {
    // Worker pour la génération de tickets
    const ticketQueue = this.queues.get('ticket-generation');
    if (ticketQueue) {
      ticketQueue.process(parseInt(process.env.QUEUE_CONCURRENCY) || 5, async (job) => {
        return await this.processTicketGenerationJob(job);
      });
    }

    // Worker pour la génération PDF
    const pdfQueue = this.queues.get('pdf-generation');
    if (pdfQueue) {
      pdfQueue.process(parseInt(process.env.QUEUE_CONCURRENCY) || 3, async (job) => {
        return await this.processPDFGenerationJob(job);
      });
    }

    // Worker pour le traitement batch
    const batchQueue = this.queues.get('batch-processing');
    if (batchQueue) {
      batchQueue.process(2, async (job) => {
        return await this.processBatchJob(job);
      });
    }

    // Gestion des événements
    this.setupQueueEvents();
  }

  /**
   * Configure les événements des queues
   */
  setupQueueEvents() {
    this.queues.forEach((queue, name) => {
      queue.on('completed', (job, result) => {
        logger.info(`Job completed in queue ${name}`, {
          jobId: job.id,
          type: job.data.type,
          duration: job.duration
        });
      });

      queue.on('failed', (job, err) => {
        logger.error(`Job failed in queue ${name}`, {
          jobId: job.id,
          type: job.data.type,
          error: err.message,
          attemptsMade: job.attemptsMade
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job stalled in queue ${name}`, {
          jobId: job.id,
          type: job.data.type
        });
      });
    });
  }

  /**
   * Crée un job de génération de tickets en lot
   * @param {Array} tickets - Liste des tickets à générer
   * @param {Object} options - Options du job
   * @returns {Promise<Object>} Job créé
   */
  async createBatchTicketJob(tickets, options = {}) {
    try {
      const jobId = this.generateJobId();
      const jobData = {
        id: jobId,
        type: 'batch-ticket-generation',
        tickets,
        options,
        createdAt: new Date().toISOString(),
        priority: options.priority || 'normal'
      };

      const queue = this.queues.get('ticket-generation');
      if (!queue) {
        return {
          success: false,
          error: 'Ticket generation queue not available',
          details: {
            message: 'The ticket generation queue is not initialized',
            queueName: 'ticket-generation'
          }
        };
      }

      const job = await queue.add('batch-ticket-generation', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      return {
        success: true,
        data: {
          jobId: job.id,
          queue: 'ticket-generation',
          ticketCount: tickets.length
        },
        message: `Batch ticket generation job queued successfully`,
        ticketsCount: tickets.length,
        estimatedDuration: this.estimateBatchDuration(tickets.length)
      };
    } catch (error) {
      logger.error('Failed to create batch ticket job', {
        ticketsCount: tickets.length,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de création du job batch: ${error.message}`
      };
    }
  }

  /**
   * Crée un job de génération PDF en lot
   * @param {Array} tickets - Liste des tickets
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options du job
   * @returns {Promise<Object>} Job créé
   */
  async createBatchPDFJob(tickets, eventData, options = {}) {
    try {
      const jobId = this.generateJobId();
      const jobData = {
        id: jobId,
        type: 'batch-pdf-generation',
        tickets,
        eventData,
        options,
        createdAt: new Date().toISOString(),
        priority: options.priority || 'normal'
      };

      const queue = this.queues.get('pdf-generation');
      if (!queue) {
        throw new Error('PDF generation queue not available');
      }

      const job = await queue.add('batch-pdf-generation', jobData, {
        jobId,
        priority: this.getPriorityValue(jobData.priority),
        delay: options.delay || 0,
        attempts: options.attempts || 3
      });

      logger.info('Batch PDF job created', {
        jobId,
        ticketsCount: tickets.length,
        eventId: eventData.id,
        priority: jobData.priority
      });

      return {
        success: true,
        jobId,
        job,
        ticketsCount: tickets.length,
        estimatedDuration: this.estimateBatchDuration(tickets.length)
      };
    } catch (error) {
      logger.error('Failed to create batch PDF job', {
        ticketsCount: tickets.length,
        eventId: eventData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de création du job PDF batch: ${error.message}`
      };
    }
  }

  /**
   * Crée un job de traitement batch complet
   * @param {Array} tickets - Liste des tickets
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options du job
   * @returns {Promise<Object>} Job créé
   */
  async createFullBatchJob(tickets, eventData, options = {}) {
    try {
      const jobId = this.generateJobId();
      const jobData = {
        id: jobId,
        type: 'full-batch-processing',
        tickets,
        eventData,
        options,
        createdAt: new Date().toISOString(),
        priority: options.priority || 'normal'
      };

      const queue = this.queues.get('batch-processing');
      if (!queue) {
        return {
          success: false,
          error: 'Batch processing queue not available',
          details: {
            message: 'The batch processing queue is not initialized',
            queueName: 'batch-processing'
          }
        };
      }

      const job = await queue.add('full-batch-processing', jobData, {
        jobId,
        priority: this.getPriorityValue(jobData.priority),
        delay: options.delay || 0,
        attempts: options.attempts || 3
      });

      logger.info('Full batch job created', {
        jobId,
        ticketsCount: tickets.length,
        eventId: eventData.id,
        priority: jobData.priority
      });

      return {
        success: true,
        jobId,
        job,
        ticketsCount: tickets.length,
        estimatedDuration: this.estimateBatchDuration(tickets.length * 2) // QR + PDF
      };
    } catch (error) {
      logger.error('Failed to create full batch job', {
        ticketsCount: tickets.length,
        eventId: eventData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de création du job batch complet: ${error.message}`
      };
    }
  }

  /**
   * Traite un job de génération de tickets
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processTicketGenerationJob(job) {
    try {
      const { tickets, options } = job.data;
      const results = [];
      
      // Importer le service QR code
      const qrCodeService = require('../qrcode/qrcode.service');
      
      for (const ticket of tickets) {
        try {
          const result = await qrCodeService.generateTicketQRCode(ticket, options.qrOptions);
          results.push({
            ticketId: ticket.id,
            success: result.success,
            qrCode: result.success ? result.qrCode : null,
            error: result.success ? null : result.error
          });
        } catch (error) {
          results.push({
            ticketId: ticket.id,
            success: false,
            qrCode: null,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        jobId: job.id,
        results,
        processed: tickets.length,
        successCount,
        failureCount: tickets.length - successCount,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process ticket generation job', {
        jobId: job.id,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Traite un job de génération PDF
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processPDFGenerationJob(job) {
    try {
      const { tickets, eventData, options } = job.data;
      
      // Importer le service PDF
      const pdfService = require('../pdf/pdf.service');
      
      const result = await pdfService.generateBatchPDF(tickets, eventData, options.pdfOptions);
      
      return {
        success: result.success,
        jobId: job.id,
        pdfBase64: result.success ? result.pdfBase64 : null,
        filename: result.success ? result.filename : null,
        error: result.success ? null : result.error,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process PDF generation job', {
        jobId: job.id,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Traite un job batch complet
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processBatchJob(job) {
    try {
      const { tickets, eventData, options } = job.data;
      const results = {
        qrCodes: [],
        pdf: null
      };
      
      // Étape 1: Générer les QR codes
      const qrCodeService = require('../qrcode/qrcode.service');
      const qrCodeResults = await qrCodeService.generateBatchQRCodes(tickets, options.qrOptions);
      results.qrCodes = qrCodeResults;
      
      // Étape 2: Générer le PDF
      const pdfService = require('../pdf/pdf.service');
      const pdfResult = await pdfService.generateBatchPDF(tickets, eventData, options.pdfOptions);
      results.pdf = pdfResult;
      
      return {
        success: true,
        jobId: job.id,
        results,
        processed: tickets.length,
        qrCodeSuccessCount: qrCodeResults.filter(r => r.success).length,
        pdfSuccess: pdfResult.success,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process batch job', {
        jobId: job.id,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Récupère le statut d'un job
   * @param {string} jobId - ID du job
   * @param {string} queueName - Nom de la queue
   * @returns {Promise<Object>} Statut du job
   */
  async getJobStatus(jobId, queueName = 'ticket-generation') {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return {
          success: false,
          error: `Queue ${queueName} not found`
        };
      }

      const job = await queue.getJob(jobId);
      
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      return {
        success: true,
        job: {
          id: job.id,
          data: job.data,
          progress: job.progress(),
          state: job.getState(),
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason
        }
      };
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de récupération du statut: ${error.message}`
      };
    }
  }

  /**
   * Annule un job
   * @param {string} jobId - ID du job
   * @param {string} queueName - Nom de la queue
   * @returns {Promise<Object>} Résultat de l'annulation
   */
  async cancelJob(jobId, queueName = 'ticket-generation') {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return {
          success: false,
          error: `Queue ${queueName} not found`
        };
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      await job.remove();
      
      logger.info('Job cancelled successfully', {
        jobId,
        queueName,
        type: job.data.type
      });

      return {
        success: true,
        cancelled: true,
        jobId
      };
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec d'annulation du job: ${error.message}`
      };
    }
  }

  /**
   * Récupère les statistiques des queues
   * @returns {Promise<Object>} Statistiques des queues
   */
  async getQueueStats() {
    try {
      const stats = {};
      
      for (const [name, queue] of this.queues) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          total: waiting.length + active.length + completed.length + failed.length
        };
      }

      return {
        success: true,
        stats,
        retrievedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de récupération des statistiques: ${error.message}`
      };
    }
  }

  /**
   * Nettoie les jobs terminés
   * @param {string} queueName - Nom de la queue (optionnel)
   * @returns {Promise<Object>} Résultat du nettoyage
   */
  async cleanCompletedJobs(queueName = null) {
    try {
      let cleanedCount = 0;
      
      if (queueName) {
        const queue = this.queues.get(queueName);
        if (queue) {
          const completed = await queue.getCompleted();
          await Promise.all(completed.map(job => job.remove()));
          cleanedCount = completed.length;
        }
      } else {
        for (const queue of this.queues.values()) {
          const completed = await queue.getCompleted();
          await Promise.all(completed.map(job => job.remove()));
          cleanedCount += completed.length;
        }
      }

      logger.info('Completed jobs cleaned', {
        queueName,
        cleanedCount
      });

      return {
        success: true,
        cleanedCount,
        cleanedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to clean completed jobs', {
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec du nettoyage: ${error.message}`
      };
    }
  }

  /**
   * Génère un ID de job unique
   * @returns {string} ID de job
   */
  generateJobId() {
    return `job_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Convertit la priorité en valeur numérique
   * @param {string} priority - Priorité textuelle
   * @returns {number} Valeur numérique
   */
  getPriorityValue(priority) {
    const priorityMap = {
      'low': 10,
      'normal': 5,
      'high': 1,
      'critical': 0
    };
    
    return priorityMap[priority] || 5;
  }

  /**
   * Estime la durée d'un traitement batch
   * @param {number} itemCount - Nombre d'items
   * @returns {number} Durée estimée en secondes
   */
  estimateBatchDuration(itemCount) {
    // Estimation: 2 secondes par item en moyenne
    return Math.ceil(itemCount * 2);
  }

  /**
   * Arrête toutes les queues
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      const shutdownPromises = Array.from(this.queues.values()).map(queue => queue.close());
      await Promise.all(shutdownPromises);
      
      logger.info('All batch queues shut down successfully');
    } catch (error) {
      logger.error('Error shutting down queues', {
        error: error.message
      });
    }
  }

  /**
   * Génère des tickets en lot (méthode directe)
   * @param {Array} tickets - Liste des tickets à générer
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} Résultat de la génération
   */
  async generateBatchTickets(tickets, options = {}) {
    try {
      const results = [];
      
      // Importer le service QR code
      const qrCodeService = require('../qrcode/qrcode.service');
      
      for (const ticket of tickets) {
        try {
          // Préparer les données pour le QR code
          const qrData = {
            id: ticket.id,
            eventId: ticket.eventId,
            code: `${ticket.id}-${ticket.eventId}`,
            type: 'TICKET'
          };
          
          const qrOptions = {
            format: options.qrFormat || 'base64',
            size: options.qrSize || 'medium',
            includeLogo: options.includeLogo || false,
            errorCorrection: 'M'
          };
          
          const result = await qrCodeService.generateTicketQRCode(qrData, qrOptions);
          results.push({
            ticketId: ticket.id,
            success: result.success,
            qrCode: result.success ? result.qrCode : null,
            checksum: result.success ? result.signature : null,
            error: result.success ? null : result.error
          });
        } catch (error) {
          results.push({
            ticketId: ticket.id,
            success: false,
            qrCode: null,
            checksum: null,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        data: {
          batchId: this.generateJobId(),
          results,
          processed: tickets.length,
          successCount,
          failureCount: tickets.length - successCount,
          processedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Failed to generate batch tickets', {
        ticketsCount: tickets.length,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération en lot: ${error.message}`
      };
    }
  }

  /**
   * Génère des PDFs en lot (méthode directe)
   * @param {Array} tickets - Liste des tickets
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} Résultat de la génération
   */
  async generateBatchPDFs(tickets, eventData, options = {}) {
    try {
      // Importer le service PDF
      const pdfService = require('../pdf/pdf.service');
      
      const result = await pdfService.generateBatchPDF(tickets, eventData, options);
      
      return {
        success: result.success,
        data: {
          batchId: this.generateJobId(),
          pdfBase64: result.success ? result.pdfBase64 : null,
          filename: result.success ? result.filename : null,
          ticketsCount: tickets.length,
          error: result.success ? null : result.error,
          processedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Failed to generate batch PDFs', {
        ticketsCount: tickets.length,
        eventId: eventData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération PDF batch: ${error.message}`
      };
    }
  }

  /**
   * Récupère les détails d'un ticket
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object>} Détails du ticket
   */
  async getTicketDetails(ticketId) {
    try {
      // Logique pour récupérer les détails du ticket depuis la base de données
      const ticketDetails = await this.getTicketDetailsFromDatabase(ticketId);
      
      if (!ticketDetails) {
        return {
          success: false,
          error: 'Ticket non trouvé'
        };
      }
      
      return {
        success: true,
        data: ticketDetails
      };
    } catch (error) {
      logger.error('Error getting ticket details:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Régénère un ticket
   * @param {string} ticketId - ID du ticket
   * @param {Object} options - Options de régénération
   * @returns {Promise<Object>} Résultat de la régénération
   */
  async regenerateTicket(ticketId, options = {}) {
    try {
      // Logique pour régénérer le ticket
      const regenerateResult = await this.regenerateTicketInDatabase(ticketId, options);
      
      if (!regenerateResult.success) {
        return {
          success: false,
          error: regenerateResult.error
        };
      }
      
      return {
        success: true,
        data: regenerateResult.data
      };
    } catch (error) {
      logger.error('Error regenerating ticket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Supprime un ticket
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object>} Résultat de la suppression
   */
  async deleteTicket(ticketId) {
    try {
      // Logique pour supprimer le ticket de la base de données
      const deleteResult = await this.deleteTicketFromDatabase(ticketId);
      
      if (!deleteResult.success) {
        return {
          success: false,
          error: deleteResult.error
        };
      }
      
      return {
        success: true,
        data: deleteResult.data
      };
    } catch (error) {
      logger.error('Error deleting ticket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Récupère les détails du ticket depuis la base de données
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object|null>} Détails du ticket
   */
  async getTicketDetailsFromDatabase(ticketId) {
    try {
      const query = `
        SELECT details, created_at
        FROM ticket_generation_logs
        WHERE details->>'ticket_id' = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await database.query(query, [String(ticketId)]);
      if (!result.rows.length) {
        return null;
      }

      const details = result.rows[0].details || {};

      return {
        ticketId,
        eventId: details.event_info?.id || null,
        ticketType: details.ticket_type?.name || null,
        status: details.pdf_generated ? 'generated' : 'processing',
        attendeeName: details.guest_info?.name || null,
        attendeeEmail: details.guest_info?.email || null,
        attendeePhone: details.guest_info?.phone || null,
        eventTitle: details.event_info?.title || null,
        eventDate: details.event_info?.date || null,
        location: details.event_info?.location || null,
        pdfFilePath: details.pdf_path || null,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      logger.error('Error getting ticket details from database:', error);
      return null;
    }
  }

  /**
   * Régénère le ticket dans la base de données
   * @param {string} ticketId - ID du ticket
   * @param {Object} options - Options de régénération
   * @returns {Promise<Object>} Résultat de la régénération
   */
  async regenerateTicketInDatabase(ticketId, options = {}) {
    try {
      // Vérifier que le ticket existe réellement avant de marquer une régénération.
      // job_id référence le ticket d'origine (event-planner-core).
      const existing = await database.query(
        'SELECT id FROM generated_tickets WHERE job_id = $1 ORDER BY generated_at DESC LIMIT 1',
        [String(ticketId)]
      );

      if (!existing.rows.length) {
        return {
          success: false,
          code: 'TICKET_NOT_FOUND',
          error: `Aucun ticket généré trouvé pour l'identifiant ${ticketId}`
        };
      }

      const regeneratedAt = new Date().toISOString();

      // Tracer la demande de régénération dans les logs (source de vérité auditable).
      await database.query(
        `INSERT INTO ticket_generation_logs (job_id, status, message, details, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          String(ticketId),
          'pending',
          `Régénération demandée pour le ticket ${ticketId}`,
          JSON.stringify({
            ticket_id: ticketId,
            action: 'regenerate',
            reason: options.reason || 'Manual regeneration',
            regenerate_qr: options.regenerateQR !== false,
            regenerate_pdf: options.regeneratePDF !== false,
            requested_at: regeneratedAt
          })
        ]
      );

      return {
        success: true,
        data: {
          ticketId,
          regeneratedAt,
          reason: options.reason || 'Manual regeneration',
          regenerateQR: options.regenerateQR !== false,
          regeneratePDF: options.regeneratePDF !== false
        }
      };
    } catch (error) {
      logger.error('Error regenerating ticket in database:', error);
      return {
        success: false,
        code: 'DATABASE_QUERY_ERROR',
        error: error.message
      };
    }
  }

  /**
   * Supprime le ticket de la base de données
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object>} Résultat de la suppression
   */
  async deleteTicketFromDatabase(ticketId) {
    try {
      // Suppression réelle des tickets générés rattachés à ce job_id.
      const deletion = await database.query(
        'DELETE FROM generated_tickets WHERE job_id = $1 RETURNING id',
        [String(ticketId)]
      );

      if (!deletion.rows.length) {
        return {
          success: false,
          code: 'TICKET_NOT_FOUND',
          error: `Aucun ticket généré trouvé pour l'identifiant ${ticketId}`
        };
      }

      const deletedAt = new Date().toISOString();

      // Tracer la suppression pour l'audit.
      await database.query(
        `INSERT INTO ticket_generation_logs (job_id, status, message, details, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          String(ticketId),
          'completed',
          `Ticket ${ticketId} supprimé`,
          JSON.stringify({
            ticket_id: ticketId,
            action: 'delete',
            deleted_rows: deletion.rows.length,
            deleted_at: deletedAt
          })
        ]
      );

      return {
        success: true,
        data: {
          ticketId,
          deletedRows: deletion.rows.length,
          deletedAt
        }
      };
    } catch (error) {
      logger.error('Error deleting ticket from database:', error);
      return {
        success: false,
        code: 'DATABASE_QUERY_ERROR',
        error: error.message
      };
    }
  }
}

module.exports = new BatchService();
