const qrCodeService = require('../../core/qrcode/qrcode.service');
const pdfService = require('../../core/pdf/pdf.service');
const batchService = require('../../core/database/batch.service');
const { successResponse, errorResponse, createdResponse } = require('../../utils/response');
const logger = require('../../utils/logger');

// Constante par défaut pour l'utilisateur ID
const DEFAULT_USER_ID = 1;

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
      const { ticketCode, ticketId, eventId, format = 'base64', size = 'medium' } = req.body;
      
      // Validation des données
      if (!ticketCode || !ticketId) {
        return res.status(400).json(
          errorResponse('Ticket code et ticket ID requis', null, 'INVALID_QR_DATA')
        );
      }

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

      const result = await qrCodeService.generateQRCode(qrData, qrOptions);
      
      if (!result.success) {
        return res.status(400).json(errorResponse(result.error));
      }

      res.json(successResponse('QR code généré avec succès', result.data));
    } catch (error) {
      logger.error('Erreur génération QR code:', error);
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
      const { ticketId, ticketData, templateId, options = {} } = req.body;
      
      // Validation des données
      if (!ticketId || !ticketData) {
        return res.status(400).json(
          errorResponse('Ticket ID et données du ticket requis', null, 'INVALID_PDF_DATA')
        );
      }

      // Options par défaut
      const pdfOptions = {
        format: 'A4',
        orientation: 'portrait',
        border: '20mm',
        ...options
      };

      const result = await pdfService.generateTicketPDF(ticketId, ticketData, templateId, pdfOptions);
      
      if (!result.success) {
        return res.status(400).json(errorResponse(result.error));
      }

      res.json(successResponse('PDF généré avec succès', result.data));
    } catch (error) {
      logger.error('Erreur génération PDF:', error);
      next(error);
    }
  }

  /**
   * Génère un ticket complet (QR code + PDF)
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateTicket(req, res, next) {
    try {
      const { ticketId, ticketCode, ticketData, eventId, templateId, options = {} } = req.body;
      
      // Validation des données
      if (!ticketId || !ticketCode || !ticketData) {
        return res.status(400).json(
          errorResponse('Ticket ID, code et données requis', null, 'INVALID_TICKET_DATA')
        );
      }

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      // Générer le QR code
      const qrData = {
        id: ticketId,
        eventId: eventId || null,
        code: ticketCode,
        type: 'TICKET'
      };

      const qrOptions = {
        format: 'base64',
        size: 'medium',
        includeLogo: false,
        errorCorrection: 'M'
      };

      const qrResult = await qrCodeService.generateQRCode(qrData, qrOptions);
      
      if (!qrResult.success) {
        return res.status(400).json(errorResponse('Erreur génération QR code: ' + qrResult.error));
      }

      // Générer le PDF
      const pdfOptions = {
        format: 'A4',
        orientation: 'portrait',
        border: '20mm',
        ...options
      };

      const pdfResult = await pdfService.generateTicketPDF(ticketId, ticketData, templateId, pdfOptions);
      
      if (!pdfResult.success) {
        return res.status(400).json(errorResponse('Erreur génération PDF: ' + pdfResult.error));
      }

      // Combiner les résultats
      const ticketData = {
        ticketId,
        qrCode: qrResult.data,
        pdf: pdfResult.data,
        generatedAt: new Date().toISOString()
      };

      res.status(201).json(createdResponse('Ticket généré avec succès', ticketData));
    } catch (error) {
      logger.error('Erreur génération ticket:', error);
      next(error);
    }
  }

  /**
   * Génère des tickets en lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateBatchTickets(req, res, next) {
    try {
      const { jobId, tickets, options = {} } = req.body;
      
      // Validation des données
      if (!jobId || !tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json(
          errorResponse('Job ID et liste de tickets requis', null, 'INVALID_BATCH_DATA')
        );
      }

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await batchService.createBatchJob(jobId, tickets, userId, options);
      
      if (!result.success) {
        return res.status(400).json(errorResponse(result.error));
      }

      res.status(201).json(createdResponse('Job de lot créé avec succès', result.data));
    } catch (error) {
      logger.error('Erreur création job lot:', error);
      next(error);
    }
  }

  /**
   * Vérifie le statut d'un job de lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async getBatchJobStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID requis', null, 'MISSING_JOB_ID')
        );
      }

      const result = await batchService.getJobStatus(jobId);
      
      if (!result.success) {
        return res.status(404).json(errorResponse(result.error));
      }

      res.json(successResponse('Statut du job récupéré', result.data));
    } catch (error) {
      logger.error('Erreur vérification statut job:', error);
      next(error);
    }
  }

  /**
   * Télécharge les résultats d'un job de lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async downloadBatchResults(req, res, next) {
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID requis', null, 'MISSING_JOB_ID')
        );
      }

      const result = await batchService.getJobResults(jobId);
      
      if (!result.success) {
        return res.status(404).json(errorResponse(result.error));
      }

      // Si le job n'est pas terminé
      if (result.data.status !== 'completed') {
        return res.status(400).json(
          errorResponse('Le job n\'est pas encore terminé', null, 'JOB_NOT_COMPLETED')
        );
      }

      res.json(successResponse('Résultats du job récupérés', result.data));
    } catch (error) {
      logger.error('Erreur téléchargement résultats job:', error);
      next(error);
    }
  }

  /**
   * Annule un job de lot
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async cancelBatchJob(req, res, next) {
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID requis', null, 'MISSING_JOB_ID')
        );
      }

      const result = await batchService.cancelJob(jobId);
      
      if (!result.success) {
        return res.status(400).json(errorResponse(result.error));
      }

      res.json(successResponse('Job annulé avec succès', result.data));
    } catch (error) {
      logger.error('Erreur annulation job:', error);
      next(error);
    }
  }

  /**
   * Valide un template de ticket
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async validateTemplate(req, res, next) {
    try {
      const { templateId, ticketData } = req.body;
      
      if (!templateId || !ticketData) {
        return res.status(400).json(
          errorResponse('Template ID et données du ticket requis', null, 'INVALID_TEMPLATE_DATA')
        );
      }

      const result = await pdfService.validateTemplate(templateId, ticketData);
      
      if (!result.success) {
        return res.status(400).json(errorResponse(result.error));
      }

      res.json(successResponse('Template validé avec succès', result.data));
    } catch (error) {
      logger.error('Erreur validation template:', error);
      next(error);
    }
  }
}

module.exports = new TicketsController();
