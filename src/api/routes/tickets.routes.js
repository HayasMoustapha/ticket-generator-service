// ========================================
// 📄 IMPORTATIONS DES LIBRAIRIES NÉCESSAIRES
// ========================================
// Express : Framework pour créer des routes web
const express = require('express');
// Joi : Librairie pour valider les données envoyées par les utilisateurs
const Joi = require('joi');
// Router : Objet Express pour gérer les routes
const router = express.Router();
// Controller : Logique métier pour traiter les demandes de tickets
const ticketsController = require('../controllers/tickets.controller');
// ValidationMiddleware : Service partagé pour valider les données
const { ValidationMiddleware } = require('../../../../shared');

/**
 * 🎫 ROUTES TECHNIQUES POUR LA GÉNÉRATION DE TICKETS
 * Ce fichier définit toutes les routes pour créer et gérer des tickets
 */

// ========================================
// 📋 SCHÉMAS DE VALIDATION DES DONNÉES
// ========================================

// Schéma pour valider la demande de génération de QR code
const generateQRCodeSchema = Joi.object({
  // ticketCode : Code unique du ticket (obligatoire)
  ticketCode: Joi.string().required(),
  // ticketId : Identifiant du ticket (obligatoire)
  ticketId: Joi.string().required(),
  // eventId : Identifiant de l'événement (optionnel)
  eventId: Joi.string().optional(),
  // ticketType : Type métier du ticket utilisé dans le payload QR
  ticketType: Joi.string().valid('standard', 'vip', 'premium', 'early-bird', 'student', 'staff').default('standard'),
  // format : Format du QR code (base64, png, svg, pdf) - par défaut base64
  format: Joi.string().valid('base64', 'png', 'svg', 'pdf').default('base64'),
  // size : Taille du QR code (small, medium, large) - par défaut medium
  size: Joi.string().valid('small', 'medium', 'large').default('medium')
});

// Schéma pour valider la demande de génération de ticket complet
// NOTE : Service technique - pas de logique utilisateur, seulement données de génération
const generateTicketSchema = Joi.object({
  // ticketData : Informations techniques du ticket (obligatoire)
  ticketData: Joi.object({
    // id : Identifiant unique du ticket (obligatoire)
    id: Joi.string().required(),
    // eventId : Identifiant de l'événement (obligatoire)
    eventId: Joi.string().required(),
    // userId : Identifiant de l'utilisateur (obligatoire pour la génération PDF)
    userId: Joi.string().required(),
    // type : Type de ticket (standard, vip, premium, staff) - par défaut standard
    type: Joi.string().valid('standard', 'vip', 'premium', 'staff').default('standard'),
    // attendeeName : Nom du participant pour affichage (obligatoire)
    attendeeName: Joi.string().required(),
    // attendeeEmail : Email pour affichage (obligatoire)
    attendeeEmail: Joi.string().email().required(),
    // attendeePhone : Téléphone du participant (optionnel pour PDF)
    attendeePhone: Joi.string().optional(),
    // eventTitle : Titre de l'événement (optionnel pour PDF)
    eventTitle: Joi.string().optional(),
    // eventDate : Date de l'événement (optionnel pour PDF)
    eventDate: Joi.string().optional(),
    // location : Lieu de l'événement (optionnel pour PDF)
    location: Joi.string().optional()
  }).required(),
  // options : Options de génération (optionnel)
  options: Joi.object({
    // qrFormat : Format du QR code (base64, png, svg) - par défaut base64
    qrFormat: Joi.string().valid('base64', 'png', 'svg').default('base64'),
    // qrSize : Taille du QR code (small, medium, large) - par défaut medium
    qrSize: Joi.string().valid('small', 'medium', 'large').default('medium'),
    // pdfFormat : Générer un PDF ou non - par défaut true
    pdfFormat: Joi.boolean().default(true),
    // includeLogo : Inclure un logo ou non - par défaut false
    includeLogo: Joi.boolean().default(false),
    // templateId : Identifiant du template PDF (optionnel)
    templateId: Joi.string().optional(),
    // customFields : Champs personnalisés (optionnel)
    customFields: Joi.object().optional(),
    // pdfOptions : Options spécifiques au PDF (optionnel)
    pdfOptions: Joi.object({
      // format : Format du PDF (A4, A5, letter) - par défaut A4
      format: Joi.string().valid('A4', 'A5', 'letter').default('A4'),
      // margins : Marges personnalisées (optionnel)
      margins: Joi.object().optional(),
      // fontSize : Taille de la police (optionnel)
      fontSize: Joi.number().min(8).max(24).optional()
    }).optional()
  }).optional()
});

// Schéma pour valider la demande de génération de tickets en lot
// NOTE : Service technique - seulement données nécessaires pour la génération
const generateBatchSchema = Joi.object({
  // tickets : Liste des tickets à générer (obligatoire, entre 1 et 100 tickets)
  tickets: Joi.array().items(
    Joi.object({
      // id : Identifiant unique du ticket (obligatoire)
      id: Joi.string().required(),
      // eventId : Identifiant de l'événement (obligatoire)
      eventId: Joi.string().required(),
      // type : Type de ticket (standard, vip, premium, staff) - par défaut standard
      type: Joi.string().valid('standard', 'vip', 'premium', 'staff').default('standard'),
      // attendeeName : Nom du participant pour affichage (obligatoire)
      attendeeName: Joi.string().required(),
      // attendeeEmail : Email pour affichage (obligatoire)
      attendeeEmail: Joi.string().email().required()
    })
  ).min(1).max(100).required(),
  // batchOptions : Options pour la génération en lot (optionnel)
  batchOptions: Joi.object({
    // qrFormat : Format du QR code (base64, png, svg) - par défaut base64
    qrFormat: Joi.string().valid('base64', 'png', 'svg').default('base64'),
    // qrSize : Taille du QR code (small, medium, large) - par défaut medium
    qrSize: Joi.string().valid('small', 'medium', 'large').default('medium'),
    // pdfFormat : Générer un PDF ou non - par défaut true
    pdfFormat: Joi.boolean().default(true),
    // includeLogo : Inclure un logo ou non - par défaut false
    includeLogo: Joi.boolean().default(false),
    // parallelGeneration : Générer en parallèle ou non - par défaut true
    parallelGeneration: Joi.boolean().default(true)
  }).optional()
});

// Schéma pour valider la demande de génération de PDF
// NOTE : Service technique - seulement données nécessaires pour la génération PDF
const generatePDFSchema = Joi.object({
  // ticketData : Informations techniques du ticket (obligatoire)
  ticketData: Joi.object({
    // id : Identifiant du ticket (obligatoire)
    id: Joi.string().required(),
    // eventId : Identifiant de l'événement (obligatoire)
    eventId: Joi.string().required(),
    // attendeeName : Nom du participant pour affichage (obligatoire)
    attendeeName: Joi.string().required(),
    // attendeeEmail : Email pour affichage (obligatoire)
    attendeeEmail: Joi.string().email().required()
  }).required(),
  // eventData : Informations de l'événement pour affichage (obligatoire)
  eventData: Joi.object({
    // id : Identifiant de l'événement (obligatoire)
    id: Joi.string().required(),
    // name : Nom de l'événement (obligatoire)
    name: Joi.string().required(),
    // date : Date de l'événement (obligatoire)
    date: Joi.string().required()
  }).required(),
  // options : Options de génération PDF (optionnel)
  options: Joi.object({
    // templateId : Identifiant du template (optionnel)
    templateId: Joi.string().optional(),
    // customFields : Champs personnalisés (optionnel)
    customFields: Joi.object().optional(),
    // pdfOptions : Options spécifiques au PDF (optionnel)
    pdfOptions: Joi.object({
      // format : Format du PDF (A4, A5, letter) - par défaut A4
      format: Joi.string().valid('A4', 'A5', 'letter').default('A4'),
      // orientation : Orientation du PDF (portrait, landscape) - par défaut portrait
      orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
      // includeWatermark : Inclure un filigrane ou non - par défaut false
      includeWatermark: Joi.boolean().default(false),
      // customTemplate : Utiliser un template personnalisé ou non - par défaut false
      customTemplate: Joi.boolean().default(false)
    }).optional()
  }).optional()
});

// Schéma pour valider la demande de génération de PDFs en lot
// NOTE : Service technique - seulement données nécessaires pour la génération PDF
const generateBatchPDFSchema = Joi.object({
  // tickets : Liste des tickets pour lesquels générer des PDFs (obligatoire, entre 1 et 50)
  tickets: Joi.array().items(
    Joi.object({
      // id : Identifiant du ticket (obligatoire)
      id: Joi.string().required(),
      // eventId : Identifiant de l'événement (obligatoire)
      eventId: Joi.string().required(),
      // attendeeName : Nom du participant pour affichage (obligatoire)
      attendeeName: Joi.string().required(),
      // attendeeEmail : Email pour affichage (obligatoire)
      attendeeEmail: Joi.string().email().required()
    })
  ).min(1).max(50).required(),
  // eventData : Informations de l'événement pour affichage (obligatoire)
  eventData: Joi.object({
    // id : Identifiant de l'événement (obligatoire)
    id: Joi.string().required(),
    // name : Nom de l'événement (obligatoire)
    name: Joi.string().required(),
    // date : Date de l'événement (obligatoire)
    date: Joi.string().required()
  }).required(),
  options: Joi.object({
    templateId: Joi.string().optional(),
    // batchOptions : Options spécifiques au lot (optionnel)
    batchOptions: Joi.object({
      // format : Format du PDF (A4, A5, letter) - par défaut A4
      format: Joi.string().valid('A4', 'A5', 'letter').default('A4'),
      // orientation : Orientation du PDF (portrait, landscape) - par défaut portrait
      orientation: Joi.string().valid('portrait', 'landscape').default('portrait'),
      // includeWatermark : Inclure un filigrane ou non - par défaut false
      includeWatermark: Joi.boolean().default(false)
    }).optional()
  }).optional()
});

// Schéma pour valider la demande de validation de ticket
const validateTicketSchema = Joi.object({
  // ticketCode : Code unique du ticket (obligatoire)
  ticketCode: Joi.string().required(),
  // ticketId : Identifiant du ticket (obligatoire)
  ticketId: Joi.string().required(),
  // eventId : Identifiant de l'événement (optionnel)
  eventId: Joi.string().optional()
});

// ========================================
// 🛣️ DÉFINITION DES ROUTES API
// ========================================

// Route POST pour générer un QR code pour un ticket
// URL : /api/tickets/qr/generate
// Pas de validation nécessaire pour cette route simple
router.post('/qr/generate',
  ticketsController.generateQRCode
);

// Route POST pour générer un ticket complet avec QR code et PDF
// URL : /api/tickets/generate
// Validation des données avec le schéma generateTicketSchema
router.post('/generate',
  ValidationMiddleware.validate(generateTicketSchema),
  ticketsController.generateTicket
);

// Route POST pour générer plusieurs tickets en lot
// URL : /api/tickets/batch
// Validation des données avec le schéma generateBatchSchema
router.post('/batch',
  ValidationMiddleware.validate(generateBatchSchema),
  ticketsController.generateBatch
);

// Route POST pour générer un PDF pour un ticket existant
// URL : /api/tickets/pdf
// Validation des données avec le schéma generatePDFSchema
router.post('/pdf',
  ValidationMiddleware.validate(generatePDFSchema),
  ticketsController.generatePDF
);

// Route POST pour générer plusieurs PDFs en lot
// URL : /api/tickets/batch-pdf
// Validation des données avec le schéma generateBatchPDFSchema
router.post('/batch-pdf',
  ValidationMiddleware.validate(generateBatchPDFSchema),
  ticketsController.generateBatchPDF
);

// NOTE : La validation de ticket est gérée par scan-validation-service
// Ce service ne fait que de la génération technique
// router.post('/validate',
//   ValidationMiddleware.validate(validateTicketSchema),
//   ticketsController.validateTicket
// );

// Route GET pour obtenir le QR code d'un ticket spécifique
// URL : /api/tickets/:ticketId/qr
// Pas de validation nécessaire, récupération simple
router.get('/:ticketId/qr',
  ticketsController.getTicketQRCode
);

// Route GET pour obtenir le PDF d'un ticket spécifique
// URL : /api/tickets/:ticketId/pdf
// Pas de validation nécessaire, récupération simple
router.get('/:ticketId/pdf',
  ticketsController.getTicketPDF
);

// Route GET pour obtenir les détails complets d'un ticket
// URL : /api/tickets/:ticketId
// Pas de validation nécessaire, récupération simple
router.get('/:ticketId',
  ticketsController.getTicketDetails
);

// Route GET pour obtenir tous les tickets d'un événement
// URL : /api/tickets/event/:eventId
// Pas de validation nécessaire, récupération simple
router.get('/event/:eventId',
  ticketsController.getEventTickets
);

// Schéma pour valider la demande de régénération de ticket
const regenerateSchema = Joi.object({
  // reason : Raison de la régénération (optionnel)
  reason: Joi.string().optional(),
  // regenerateQR : Régénérer le QR code ou non - par défaut true
  regenerateQR: Joi.boolean().default(true),
  // regeneratePDF : Régénérer le PDF ou non - par défaut true
  regeneratePDF: Joi.boolean().default(true)
});

// Route POST pour régénérer un ticket existant
// URL : /api/tickets/:ticketId/regenerate
// Validation des données avec le schéma regenerateSchema
router.post('/:ticketId/regenerate',
  ValidationMiddleware.validate(regenerateSchema),
  ticketsController.regenerateTicket
);

// ========================================
// ROUTES MANQUANTES POUR LES TEMPLATES EMAIL
// ========================================

/**
 * @swagger
 * /tickets/{ticketId}/download:
 *   get:
 *     summary: Télécharger un ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fichier PDF du ticket
 *       404:
 *         description: Ticket non trouvé
 */
router.get('/:ticketId/download',
  ValidationMiddleware.validate(Joi.object({
    ticketId: Joi.string().required()
  }), 'params'),
  ticketsController.downloadTicket
);

/**
 * @swagger
 * /tickets/{ticketId}/qr:
 *   get:
 *     summary: Obtenir le code QR d'un ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image du code QR
 *       404:
 *         description: Ticket non trouvé
 */
router.get('/:ticketId/qr',
  ValidationMiddleware.validate(Joi.object({
    ticketId: Joi.string().required()
  }), 'params'),
  ticketsController.getTicketQR
);

// NOTE : La suppression de tickets métier est gérée par event-planner-core
// Ce service ne gère que la génération technique
// router.delete('/:ticketId',
//   ticketsController.deleteTicket
// );

// ========================================
// 📤 EXPORTATION DU ROUTER
// ========================================
// Exporte le router pour l'utiliser dans le serveur principal
module.exports = router;
