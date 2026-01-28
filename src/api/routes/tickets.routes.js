const express = require('express');
const Joi = require('joi');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const { ValidationMiddleware } = require('../../../../shared');
const ticketGeneratorErrorHandler = require('../../error/ticket-generator.errorHandler');

/**
 * Routes techniques pour la génération de tickets
 */

// Apply error handler for all routes
router.use(ticketGeneratorErrorHandler);

// Validation schemas
const generateQRCodeSchema = Joi.object({
  ticketCode: Joi.string().required(),
  ticketId: Joi.string().required(),
  eventId: Joi.string().optional(),
  format: Joi.string().valid('base64', 'png', 'svg', 'pdf').default('base64'),
  size: Joi.string().valid('small', 'medium', 'large').default('medium')
});

const generateTicketSchema = Joi.object({
  eventId: Joi.string().required(),
  ticketType: Joi.string().valid('standard', 'vip', 'premium', 'staff').required(),
  attendeeInfo: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional(),
    address: Joi.object().optional()
  }).required(),
  ticketOptions: Joi.object({
    qrFormat: Joi.string().valid('base64', 'png', 'svg').default('base64'),
    qrSize: Joi.string().valid('small', 'medium', 'large').default('medium'),
    pdfFormat: Joi.boolean().default(true),
    includeLogo: Joi.boolean().default(false),
    customFields: Joi.object().optional()
  }).optional()
});

const generateBatchSchema = Joi.object({
  tickets: Joi.array().items(
    Joi.object({
      eventId: Joi.string().required(),
      ticketType: Joi.string().valid('standard', 'vip', 'premium', 'staff').required(),
      attendeeInfo: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().optional(),
        address: Joi.object().optional()
      }).required()
    })
  ).min(1).max(100).required(),
  batchOptions: Joi.object({
    qrFormat: Joi.string().valid('base64', 'png', 'svg').default('base64'),
    qrSize: Joi.string().valid('small', 'medium', 'large').default('medium'),
    pdfFormat: Joi.boolean().default(true),
    includeLogo: Joi.boolean().default(false),
    parallelGeneration: Joi.boolean().default(true)
  }).optional()
});

const generatePDFSchema = Joi.object({
  ticketId: Joi.string().required(),
  templateId: Joi.string().optional(),
  customFields: Joi.object().optional(),
  pdfOptions: Joi.object({
    format: Joi.string().valid('A4', 'A5', 'letter').default('A4'),
    orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
    includeWatermark: Joi.boolean().default(false),
    customTemplate: Joi.boolean().default(false)
  }).optional()
});

const generateBatchPDFSchema = Joi.object({
  ticketIds: Joi.array().items(Joi.string()).min(1).max(50).required(),
  templateId: Joi.string().optional(),
  batchOptions: Joi.object({
    format: Joi.string().valid('A4', 'A5', 'letter').default('A4'),
    orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
    includeWatermark: Joi.boolean().default(false),
    parallelGeneration: Joi.boolean().default(true)
  }).optional()
});

const validateTicketSchema = Joi.object({
  ticketCode: Joi.string().required(),
  ticketId: Joi.string().required(),
  eventId: Joi.string().optional()
});

// POST /api/tickets/qr/generate - Générer un QR code pour un ticket
router.post('/qr/generate',
  ValidationMiddleware.validate({ body: generateQRCodeSchema }),
  ticketsController.generateQRCode
);

// POST /api/tickets/generate - Générer un ticket unique
router.post('/generate',
  ValidationMiddleware.validate({ body: generateTicketSchema }),
  ticketsController.generateTicket
);

// POST /api/tickets/batch - Générer des tickets en lot
router.post('/batch',
  ValidationMiddleware.validate({ body: generateBatchSchema }),
  ticketsController.generateBatch
);

// POST /api/tickets/pdf - Générer un PDF pour un ticket
router.post('/pdf',
  ValidationMiddleware.validate({ body: generatePDFSchema }),
  ticketsController.generatePDF
);

// POST /api/tickets/batch-pdf - Générer des PDFs en lot
router.post('/batch-pdf',
  ValidationMiddleware.validate({ body: generateBatchPDFSchema }),
  ticketsController.generateBatchPDF
);

// GET /api/tickets/:ticketId/qr - Obtenir le QR code d'un ticket
router.get('/:ticketId/qr',
  ticketsController.getTicketQRCode
);

// GET /api/tickets/:ticketId/pdf - Obtenir le PDF d'un ticket
router.get('/:ticketId/pdf',
  ticketsController.getTicketPDF
);

// POST /api/tickets/validate - Valider un ticket
router.post('/validate',
  ValidationMiddleware.validate({ body: validateTicketSchema }),
  ticketsController.validateTicket
);

// GET /api/tickets/:ticketId - Obtenir les détails d'un ticket
router.get('/:ticketId',
  ticketsController.getTicketDetails
);

// GET /api/tickets/event/:eventId - Obtenir les tickets d'un événement
router.get('/event/:eventId',
  ticketsController.getEventTickets
);

// POST /api/tickets/:ticketId/regenerate - Régénérer un ticket
router.post('/:ticketId/regenerate',
  ValidationMiddleware.validateParams({
    ticketId: Joi.string().required()
  }),
  ValidationMiddleware.validate({
    body: Joi.object({
      reason: Joi.string().optional(),
      regenerateQR: Joi.boolean().default(true),
      regeneratePDF: Joi.boolean().default(true)
    })
  }),
  ticketsController.regenerateTicket
);

// DELETE /api/tickets/:ticketId - Supprimer un ticket
router.delete('/:ticketId',
  ValidationMiddleware.validateParams({
    ticketId: Joi.string().required()
  }),
  ticketsController.deleteTicket
);

module.exports = router;
