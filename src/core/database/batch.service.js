const Queue = require('bull');
const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * Service de traitement par lots pour les tickets
 * Gère les jobs de génération en masse avec Redis Queue
 */
class BatchService {
  constructor() {
    this.queues = new Map();
    this.jobOptions = {
      removeOnComplete: parseInt(process.env.QUEUE_DEFAULT_JOB_OPTIONS_REMOVE_ON_COMPLETE) || 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    };
    
    this.initializeQueues();
  }

  /**
   * Initialise les queues Redis
   */
  initializeQueues() {
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
        throw new Error('Ticket generation queue not available');
      }

      const job = await queue.add('batch-ticket-generation', jobData, {
        jobId,
        priority: this.getPriorityValue(jobData.priority),
        delay: options.delay || 0,
        attempts: options.attempts || 3
      });

      logger.info('Batch ticket job created', {
        jobId,
        ticketsCount: tickets.length,
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
        throw new Error('Batch processing queue not available');
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
}

module.exports = new BatchService();
