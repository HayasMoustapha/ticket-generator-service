const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const { validate, schemas } = require('../../middleware/validation');

/**
 * Routes pour la génération de tickets
 */

// POST /api/tickets/qr/generate - Générer un QR code pour un ticket
router.post('/qr/generate',
  ticketsController.generateQRCode
);

// POST /api/tickets/generate - Générer un ticket unique
router.post('/generate',
  validate(schemas.generateTicket, 'body'),
  ticketsController.generateTicket
);

// POST /api/tickets/batch - Générer des tickets en lot
router.post('/batch',
  validate(schemas.generateBatch, 'body'),
  ticketsController.generateBatchTickets
);

// POST /api/tickets/pdf - Générer un PDF pour un ticket
router.post('/pdf',
  validate(schemas.generatePDF, 'body'),
  ticketsController.generatePDF
);

// POST /api/tickets/batch-pdf - Générer des PDFs en lot
router.post('/batch-pdf',
  validate(schemas.generateBatchPDF, 'body'),
  ticketsController.generateBatchPDF
);

// POST /api/tickets/full-batch - Générer un traitement batch complet
router.post('/full-batch',
  validate(schemas.generateFullBatch, 'body'),
  ticketsController.generateFullBatch
);

// GET /api/tickets/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  ticketsController.getBatchJobStatus
);

// DELETE /api/tickets/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  ticketsController.cancelBatchJob
);

// GET /api/tickets/:ticketId/download - Télécharger un ticket au format PDF
router.get('/:ticketId/download',
  ticketsController.downloadTicket
);

// GET /api/tickets/:ticketId/qrcode - Télécharger le QR code d'un ticket
router.get('/:ticketId/qrcode',
  ticketsController.downloadQRCode
);

// GET /api/tickets/queue/stats - Récupérer les statistiques des queues
router.get('/queue/stats',
  ticketsController.getQueueStats
);

// POST /api/tickets/queue/clean - Nettoyer les jobs terminés
router.post('/queue/clean',
  ticketsController.cleanCompletedJobs
);

// Routes supplémentaires pour correspondre à Postman

// POST /api/tickets/jobs - Créer un job de génération
router.post('/jobs',
  validate(schemas.createJob, 'body'),
  ticketsController.createJob
);

// POST /api/tickets/jobs/:jobId/process - Traiter un job spécifique
router.post('/jobs/:jobId/process',
  ticketsController.processJob
);

// GET /api/tickets/jobs - Lister les jobs
router.get('/jobs',
  ticketsController.listJobs
);

// GET /api/tickets/events/:eventId/tickets - Récupérer les tickets d'un événement
router.get('/events/:eventId/tickets',
  ticketsController.getEventTickets
);

// GET /api/tickets/events/:eventId/stats - Statistiques de tickets d'un événement
router.get('/events/:eventId/stats',
  ticketsController.getEventTicketStats
);

// Health check routes
router.get('/health',
  ticketsController.healthCheck
);

router.get('/',
  (req, res) => {
    res.json({
      service: 'Ticket Generator API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        generate: 'POST /api/tickets/generate',
        qrGenerate: 'POST /api/tickets/qr/generate',
        batch: 'POST /api/tickets/batch',
        pdf: 'POST /api/tickets/pdf',
        batchPdf: 'POST /api/tickets/batch-pdf',
        fullBatch: 'POST /api/tickets/full-batch',
        jobStatus: 'GET /api/tickets/job/:jobId/status',
        cancelJob: 'DELETE /api/tickets/job/:jobId/cancel',
        createJob: 'POST /api/tickets/jobs',
        processJob: 'POST /api/tickets/jobs/:jobId/process',
        listJobs: 'GET /api/tickets/jobs',
        download: 'GET /api/tickets/:ticketId/download',
        qrcode: 'GET /api/tickets/:ticketId/qrcode',
        queueStats: 'GET /api/tickets/queue/stats',
        queueClean: 'POST /api/tickets/queue/clean',
        eventTickets: 'GET /api/tickets/events/:eventId/tickets',
        eventStats: 'GET /api/tickets/events/:eventId/stats'
      },
      timestamp: new Date().toISOString()
    });
  });

module.exports = router;
