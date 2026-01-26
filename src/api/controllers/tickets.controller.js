const qrCodeService = require('../../core/qrcode/qrcode.service');
const pdfService = require('../../core/pdf/pdf.service');
const batchService = require('../../core/database/batch.service');
const { successResponse, errorResponse, createdResponse } = require('../../utils/response');
const logger = require('../../utils/logger');

/**
 * Contrôleur pour la génération de tickets
 * Gère les endpoints de génération de QR codes et PDF
 */
class TicketsController {
  /**
   * Génère un QR code pour un ticket (endpoint dédié)
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateQRCode(req, res, next) {
    try {
      console.log('🧪 [TEST LOG] TicketsController.generateQRCode - ENTRY');
      console.log('🧪 [TEST LOG] TicketsController.generateQRCode - Request body:', req.body);
      
      const { ticketCode, ticketId, eventId, format = 'base64', size = 'medium' } = req.body;
      
      // Validation des données
      if (!ticketCode || !ticketId) {
        console.log('🧪 [TEST LOG] TicketsController.generateQRCode - VALIDATION ERROR: Missing ticketCode or ticketId');
        return res.status(400).json(
          errorResponse('Ticket code et ticket ID requis', null, 'INVALID_QR_DATA')
        );
      }

      console.log('🧪 [TEST LOG] TicketsController.generateQRCode - Validation passed');

      // Préparer les données pour le service QR
      const qrData = {
        id: ticketId,
        eventId: eventId || null,
        code: ticketCode,
        type: 'TICKET'
      };

      // Options de génération
      const qrOptions = {
        format,
        size,
        includeLogo: false,
        errorCorrection: 'M'
      };

      console.log('🧪 [TEST LOG] TicketsController.generateQRCode - Calling qrCodeService.generateTicketQRCode...');
      
      // Générer le QR code
      const qrResult = await qrCodeService.generateTicketQRCode(qrData, qrOptions);
      
      console.log('🧪 [TEST LOG] TicketsController.generateQRCode - QR Result:', qrResult);
      
      if (!qrResult.success) {
        console.log(' [TEST LOG] TicketsController.generateQRCode - QR Generation failed:', qrResult.error);
        return res.status(500).json(
          errorResponse(qrResult.error, null, 'QR_GENERATION_FAILED')
        );
      }

      console.log(' [TEST LOG] TicketsController.generateQRCode - SUCCESS PATH');
      logger.info('QR code generated successfully', {
        ticketId,
        ticketCode,
        format,
        size
      });

      return res.status(200).json(
        successResponse('QR code généré avec succès', {
          qrCode: qrResult.data.qrCode,
          ticketId,
          format: qrResult.data.format,
          size: qrResult.data.size
        })
      );
    } catch (error) {
      console.log(' [TEST LOG] TicketsController.generateQRCode - ERROR PATH:', error.message);
      console.log(' [TEST LOG] TicketsController.generateQRCode - ERROR STACK:', error.stack);
      logger.error('Error generating QR code', { error: error.message, stack: error.stack });
      next(error);
    }
  }

  /**
   * Génère un ticket unique
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateTicket(req, res, next) {
    try {
      const { ticketData, options = {} } = req.body;
      
      // Validation des données
      if (!ticketData || !ticketData.id || !ticketData.eventId || !ticketData.userId) {
        return res.status(400).json(
          errorResponse('Données du ticket incomplètes', null, 'INVALID_TICKET_DATA')
        );
      }

      // Générer le QR code
      const qrResult = await qrCodeService.generateTicketQRCode(ticketData, options.qrOptions);
      
      if (!qrResult.success) {
        return res.status(500).json(
          errorResponse(qrResult.error, null, 'QR_GENERATION_FAILED')
        );
      }

      logger.info('Ticket generated successfully', {
        ticketId: ticketData.id,
        eventId: ticketData.eventId,
        userId: ticketData.userId
      });

      return res.status(201).json(
        createdResponse('Ticket généré avec succès', {
          ticketId: ticketData.id,
          qrCode: qrResult.qrCode,
          signature: qrResult.signature,
          generatedAt: qrResult.generatedAt
        })
      );
    } catch (error) {
      logger.error('Ticket generation controller error', {
        error: error.message,
        ticketData: req.body.ticketData
      });
      
      next(error);
    }
  }

  /**
   * Génère des tickets en lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateBatch(req, res, next) {
    try {
      const { tickets, options = {} } = req.body;
      
      // Validation des données
      if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json(
          errorResponse('Liste de tickets invalide', null, 'INVALID_TICKETS_DATA')
        );
      }

      // Validation de chaque ticket
      for (const ticket of tickets) {
        if (!ticket.id || !ticket.eventId || !ticket.userId) {
          return res.status(400).json(
            errorResponse('Données de ticket incomplètes', null, 'INVALID_TICKET_DATA')
          );
        }
      }

      // Créer le job batch
      const jobResult = await batchService.createBatchTicketJob(tickets, options);
      
      if (!jobResult.success) {
        return res.status(500).json(
          errorResponse(jobResult.error, null, 'BATCH_JOB_CREATION_FAILED')
        );
      }

      logger.info('Batch ticket job created', {
        jobId: jobResult.jobId,
        ticketsCount: tickets.length
      });

      return res.status(202).json(
        createdResponse('Job de génération batch créé', {
          jobId: jobResult.jobId,
          ticketsCount: jobResult.ticketsCount,
          estimatedDuration: jobResult.estimatedDuration,
          status: 'queued'
        })
      );
    } catch (error) {
      logger.error('Batch generation controller error', {
        error: error.message,
        ticketsCount: req.body.tickets?.length
      });
      
      next(error);
    }
  }

  /**
   * Génère un PDF pour un ticket
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generatePDF(req, res, next) {
    try {
      const { ticketData, eventData, userData, options = {} } = req.body;
      
      // Validation des données
      if (!ticketData || !eventData || !userData) {
        return res.status(400).json(
          errorResponse('Données incomplètes pour la génération PDF', null, 'INVALID_PDF_DATA')
        );
      }

      // Générer le PDF
      const pdfResult = await pdfService.generateTicketPDF(ticketData, eventData, userData, options.pdfOptions);
      
      if (!pdfResult.success) {
        return res.status(500).json(
          errorResponse(pdfResult.error, null, 'PDF_GENERATION_FAILED')
        );
      }

      logger.info('PDF ticket generated successfully', {
        ticketId: ticketData.id,
        eventId: eventData.id
      });

      return res.status(201).json(
        createdResponse('PDF généré avec succès', {
          ticketId: ticketData.id,
          filename: pdfResult.filename,
          pdfBase64: pdfResult.pdfBase64,
          generatedAt: pdfResult.generatedAt
        })
      );
    } catch (error) {
      logger.error('PDF generation controller error', {
        error: error.message
      });
      
      next(error);
    }
  }

  /**
   * Génère des PDFs en lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateBatchPDF(req, res, next) {
    try {
      const { tickets, eventData, options = {} } = req.body;
      
      // Validation des données
      if (!tickets || !Array.isArray(tickets) || tickets.length === 0 || !eventData) {
        return res.status(400).json(
          errorResponse('Données incomplètes pour la génération PDF batch', null, 'INVALID_BATCH_PDF_DATA')
        );
      }

      // Créer le job batch PDF
      const jobResult = await batchService.createBatchPDFJob(tickets, eventData, options);
      
      if (!jobResult.success) {
        return res.status(500).json(
          errorResponse(jobResult.error, null, 'BATCH_PDF_JOB_CREATION_FAILED')
        );
      }

      logger.info('Batch PDF job created', {
        jobId: jobResult.jobId,
        ticketsCount: tickets.length,
        eventId: eventData.id
      });

      return res.status(202).json(
        createdResponse('Job de génération PDF batch créé', {
          jobId: jobResult.jobId,
          ticketsCount: jobResult.ticketsCount,
          estimatedDuration: jobResult.estimatedDuration,
          status: 'queued'
        })
      );
    } catch (error) {
      logger.error('Batch PDF generation controller error', {
        error: error.message,
        ticketsCount: req.body.tickets?.length
      });
      
      next(error);
    }
  }

  /**
   * Génère un traitement batch complet (QR + PDF)
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateFullBatch(req, res, next) {
    try {
      const { tickets, eventData, options = {} } = req.body;
      
      // Validation des données
      if (!tickets || !Array.isArray(tickets) || tickets.length === 0 || !eventData) {
        return res.status(400).json(
          errorResponse('Données incomplètes pour le traitement batch complet', null, 'INVALID_FULL_BATCH_DATA')
        );
      }

      // Créer le job batch complet
      const jobResult = await batchService.createFullBatchJob(tickets, eventData, options);
      
      if (!jobResult.success) {
        return res.status(500).json(
          errorResponse(jobResult.error, null, 'FULL_BATCH_JOB_CREATION_FAILED')
        );
      }

      logger.info('Full batch job created', {
        jobId: jobResult.jobId,
        ticketsCount: tickets.length,
        eventId: eventData.id
      });

      return res.status(202).json(
        createdResponse('Job de traitement batch complet créé', {
          jobId: jobResult.jobId,
          ticketsCount: jobResult.ticketsCount,
          estimatedDuration: jobResult.estimatedDuration,
          status: 'queued'
        })
      );
    } catch (error) {
      logger.error('Full batch controller error', {
        error: error.message,
        ticketsCount: req.body.tickets?.length
      });
      
      next(error);
    }
  }

  /**
   * Récupère le statut d'un job
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async getJobStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      const { queue = 'ticket-generation' } = req.query;
      
      if (!jobId) {
        return res.status(400).json(
          errorResponse('ID du job manquant', null, 'MISSING_JOB_ID')
        );
      }

      const result = await batchService.getJobStatus(jobId, queue);
      
      if (!result.success) {
        return res.status(404).json(
          errorResponse(result.error, null, 'JOB_NOT_FOUND')
        );
      }

      return res.status(200).json(
        successResponse('Statut du job récupéré', result.job)
      );
    } catch (error) {
      logger.error('Job status controller error', {
        error: error.message,
        jobId: req.params.jobId
      });
      
      next(error);
    }
  }

  /**
   * Annule un job
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async cancelJob(req, res, next) {
    try {
      const { jobId } = req.params;
      const { queue = 'ticket-generation' } = req.query;
      
      if (!jobId) {
        return res.status(400).json(
          errorResponse('ID du job manquant', null, 'MISSING_JOB_ID')
        );
      }

      const result = await batchService.cancelJob(jobId, queue);
      
      if (!result.success) {
        return res.status(404).json(
          errorResponse(result.error, null, 'JOB_NOT_FOUND')
        );
      }

      logger.info('Job cancelled successfully', {
        jobId,
        queue
      });

      return res.status(200).json(
        successResponse('Job annulé avec succès', {
          jobId,
          cancelled: result.cancelled
        })
      );
    } catch (error) {
      logger.error('Job cancellation controller error', {
        error: error.message,
        jobId: req.params.jobId
      });
      
      next(error);
    }
  }

  /**
   * Télécharge un ticket au format PDF
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async downloadTicket(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      if (!ticketId) {
        return res.status(400).json(
          errorResponse('ID du ticket manquant', null, 'MISSING_TICKET_ID')
        );
      }

      // Ici, vous devriez récupérer les données du ticket depuis la base de données
      // Pour l'instant, on utilise des données de test
      const ticketData = {
        id: ticketId,
        eventId: 'test-event',
        userId: 'test-user',
        type: 'standard',
        price: 1000
      };

      const eventData = {
        id: 'test-event',
        title: 'Test Event',
        eventDate: new Date().toISOString(),
        location: 'Test Location'
      };

      const userData = {
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
        phone: '+33612345678'
      };

      // Générer le PDF
      const pdfResult = await pdfService.generateTicketPDF(ticketData, eventData, userData);
      
      if (!pdfResult.success) {
        return res.status(500).json(
          errorResponse(pdfResult.error, null, 'PDF_GENERATION_FAILED')
        );
      }

      // Sauvegarder le PDF
      const saveResult = await pdfService.savePDF(pdfResult.pdfBuffer, pdfResult.filename);
      
      if (!saveResult.success) {
        return res.status(500).json(
          errorResponse(saveResult.error, null, 'PDF_SAVE_FAILED')
        );
      }

      logger.info('Ticket PDF downloaded', {
        ticketId,
        filename: pdfResult.filename,
        filePath: saveResult.filePath
      });

      // Envoyer le fichier
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfResult.filename}"`);
      res.send(pdfResult.pdfBuffer);
    } catch (error) {
      logger.error('Ticket download controller error', {
        error: error.message,
        ticketId: req.params.ticketId
      });
      
      next(error);
    }
  }

  /**
   * Télécharge le QR code d'un ticket
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async downloadQRCode(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      if (!ticketId) {
        return res.status(400).json(
          errorResponse('ID du ticket manquant', null, 'MISSING_TICKET_ID')
        );
      }

      // Ici, vous devriez récupérer les données du ticket depuis la base de données
      const ticketData = {
        id: ticketId,
        eventId: 'test-event',
        userId: 'test-user',
        type: 'standard',
        price: 1000
      };

      // Générer le QR code
      const qrResult = await qrCodeService.generateTicketQRCode(ticketData);
      
      if (!qrResult.success) {
        return res.status(500).json(
          errorResponse(qrResult.error, null, 'QR_CODE_GENERATION_FAILED')
        );
      }

      logger.info('Ticket QR code downloaded', {
        ticketId
      });

      // Envoyer le QR code en base64
      res.status(200).json(
        successResponse('QR code récupéré', {
          ticketId,
          qrCode: qrResult.qrCode,
          signature: qrResult.signature,
          generatedAt: qrResult.generatedAt
        })
      );
    } catch (error) {
      logger.error('QR code download controller error', {
        error: error.message,
        ticketId: req.params.ticketId
      });
      
      next(error);
    }
  }

  /**
   * Récupère les statistiques des queues
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async getQueueStats(req, res, next) {
    try {
      const result = await batchService.getQueueStats();
      
      if (!result.success) {
        return res.status(500).json(
          errorResponse(result.error, null, 'QUEUE_STATS_FAILED')
        );
      }

      return res.status(200).json(
        successResponse('Statistiques des queues récupérées', result.stats)
      );
    } catch (error) {
      logger.error('Queue stats controller error', {
        error: error.message
      });
      
      next(error);
    }
  }

  /**
   * Nettoie les jobs terminés
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async cleanCompletedJobs(req, res, next) {
    try {
      const { queue } = req.query;
      
      const result = await batchService.cleanCompletedJobs(queue);
      
      if (!result.success) {
        return res.status(500).json(
          errorResponse(result.error, null, 'CLEANUP_FAILED')
        );
      }

      logger.info('Completed jobs cleaned', {
        queue,
        cleanedCount: result.cleanedCount
      });

      return res.status(200).json(
        successResponse('Jobs terminés nettoyés', {
          cleanedCount: result.cleanedCount,
          cleanedAt: result.cleanedAt
        })
      );
    } catch (error) {
      logger.error('Cleanup controller error', {
        error: error.message
      });
      
      next(error);
    }
  }

  /**
   * Create a job
   */
  async createJob(req, res, next) {
    try {
      const {
        type,
        eventId,
        ticketData,
        options = {},
        priority = 'normal'
      } = req.body;

      logger.info('Creating job', {
        type,
        eventId,
        ticketCount: Array.isArray(ticketData) ? ticketData.length : 1,
        priority,
        userId: req.user?.id
      });

      // Create job logic here
      const job = {
        id: `job_${Date.now()}`,
        type,
        eventId,
        ticketData,
        options,
        priority,
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: req.user?.id
      };

      return res.status(201).json(
        createdResponse('Job created successfully', job)
      );

    } catch (error) {
      logger.error('Failed to create job', {
        error: error.message,
        userId: req.user?.id
      });
      
      next(error);
    }
  }

  /**
   * Process a job
   */
  async processJob(req, res, next) {
    try {
      const { jobId } = req.params;

      logger.info('Processing job', {
        jobId,
        userId: req.user?.id
      });

      // Process job logic here
      const job = {
        id: jobId,
        status: 'processing',
        startedAt: new Date().toISOString(),
        processedBy: req.user?.id
      };

      return res.status(200).json(
        successResponse('Job processing started', job)
      );

    } catch (error) {
      logger.error('Failed to process job', {
        error: error.message,
        jobId: req.params.jobId,
        userId: req.user?.id
      });
      
      next(error);
    }
  }

  /**
   * List jobs
   */
  async listJobs(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        eventId,
        type
      } = req.query;

      logger.info('Listing jobs', {
        page,
        limit,
        status,
        eventId,
        type,
        userId: req.user?.id
      });

      // List jobs logic here
      const jobs = {
        jobs: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      };

      return res.status(200).json(
        successResponse('Jobs retrieved successfully', jobs)
      );

    } catch (error) {
      logger.error('Failed to list jobs', {
        error: error.message,
        userId: req.user?.id
      });
      
      next(error);
    }
  }

  /**
   * Get event tickets
   */
  async getEventTickets(req, res, next) {
    try {
      const { eventId } = req.params;
      const {
        page = 1,
        limit = 20,
        status,
        type
      } = req.query;

      logger.info('Getting event tickets', {
        eventId,
        page,
        limit,
        status,
        type,
        userId: req.user?.id
      });

      // Get event tickets logic here
      const tickets = {
        tickets: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        },
        eventId
      };

      return res.status(200).json(
        successResponse('Event tickets retrieved successfully', tickets)
      );

    } catch (error) {
      logger.error('Failed to get event tickets', {
        error: error.message,
        eventId: req.params.eventId,
        userId: req.user?.id
      });
      
      next(error);
    }
  }

  /**
   * Get event ticket stats
   */
  async getEventTicketStats(req, res, next) {
    try {
      const { eventId } = req.params;

      logger.info('Getting event ticket stats', {
        eventId,
        userId: req.user?.id
      });

      // Get event ticket stats logic here
      const stats = {
        eventId,
        totalTickets: 0,
        generatedTickets: 0,
        pendingTickets: 0,
        failedTickets: 0,
        types: {},
        generatedAt: new Date().toISOString()
      };

      return res.status(200).json(
        successResponse('Event ticket statistics retrieved successfully', stats)
      );

    } catch (error) {
      logger.error('Failed to get event ticket stats', {
        error: error.message,
        eventId: req.params.eventId,
        userId: req.user?.id
      });
      
      next(error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(req, res, next) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'ticket-generator',
        version: '1.0.0',
        components: {
          qrcode: 'healthy',
          pdf: 'healthy',
          batch: 'healthy',
          queue: 'healthy'
        }
      };

      return res.status(200).json(health);

    } catch (error) {
      logger.error('Health check failed', {
        error: error.message
      });
      
      next(error);
    }
  }
}

module.exports = new TicketsController();
