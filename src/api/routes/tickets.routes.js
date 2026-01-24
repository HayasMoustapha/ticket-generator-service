const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/rbac');
const { validate, schemas } = require('../../middleware/validation');

/**
 * Routes pour la génération de tickets
 */

// Middleware d'authentification pour toutes les routes
router.use(authenticate);

// POST /api/tickets/generate - Générer un ticket unique
router.post('/generate',
  requirePermission('tickets.create'),
  validate(schemas.generateTicket, 'body'),
  ticketsController.generateTicket
);

// POST /api/tickets/batch - Générer des tickets en lot
router.post('/batch',
  requirePermission('tickets.batch.create'),
  validate(schemas.generateBatch, 'body'),
  ticketsController.generateBatch
);

// POST /api/tickets/pdf - Générer un PDF pour un ticket
router.post('/pdf',
  requirePermission('tickets.pdf.create'),
  validate(schemas.generatePDF, 'body'),
  ticketsController.generatePDF
);

// POST /api/tickets/batch-pdf - Générer des PDFs en lot
router.post('/batch-pdf',
  requirePermission('tickets.pdf.batch'),
  validate(schemas.generateBatchPDF, 'body'),
  ticketsController.generateBatchPDF
);

// POST /api/tickets/full-batch - Générer un traitement batch complet
router.post('/full-batch',
  requirePermission('tickets.full.batch'),
  validate(schemas.generateFullBatch, 'body'),
  ticketsController.generateFullBatch
);

// GET /api/tickets/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  requirePermission('tickets.jobs.read'),
  ticketsController.getJobStatus
);

// DELETE /api/tickets/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  requirePermission('tickets.jobs.cancel'),
  ticketsController.cancelJob
);

// GET /api/tickets/:ticketId/download - Télécharger un ticket au format PDF
router.get('/:ticketId/download',
  requirePermission('tickets.read'),
  ticketsController.downloadTicket
);

// GET /api/tickets/:ticketId/qrcode - Télécharger le QR code d'un ticket
router.get('/:ticketId/qrcode',
  requirePermission('tickets.read'),
  ticketsController.downloadQRCode
);

// GET /api/tickets/queue/stats - Récupérer les statistiques des queues
router.get('/queue/stats',
  requirePermission('tickets.stats.read'),
  ticketsController.getQueueStats
);

// POST /api/tickets/queue/clean - Nettoyer les jobs terminés
router.post('/queue/clean',
  requirePermission('tickets.admin'),
  ticketsController.cleanCompletedJobs
);

module.exports = router;
