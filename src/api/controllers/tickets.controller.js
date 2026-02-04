// ========================================
// 📄 IMPORTATIONS DES SERVICES ET UTILITAIRES
// ========================================
// qrCodeService : Service pour générer les QR codes
const qrCodeService = require('../../core/qrcode/qrcode.service');
// pdfService : Service pour générer les PDFs
const pdfService = require('../../core/pdf/pdf.service');
// batchService : Service pour gérer les traitements en lot
const batchService = require('../../core/database/batch.service');
// Fonctions utilitaires pour formater les réponses API
const { successResponse, errorResponse, createdResponse } = require('../../utils/response');
// Logger pour enregistrer les événements et erreurs
const logger = require('../../utils/logger');

/**
 * 🎫 CONTRÔLEUR POUR LA GÉNÉRATION DE TICKETS
 * Ce contrôleur gère toutes les opérations de création et gestion de tickets
 * Il coordonne les différents services (QR, PDF, batch) pour traiter les demandes
 */
class TicketsController {
  
  // ========================================
  // 📱 GÉNÉRATION DE QR CODE
  // ========================================
  
  /**
   * Génère un QR code pour un ticket (endpoint dédié)
   * Cette méthode crée uniquement un QR code sans le ticket complet
   * @param {Object} req - Requête Express avec les données du ticket
   * @param {Object} res - Réponse Express pour retourner le résultat
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async generateQRCode(req, res, next) {
    try {
      // Extraction des données envoyées dans le corps de la requête
      const { ticketCode, ticketId, eventId, format = 'base64', size = 'medium' } = req.body;
      
      // Vérification que les données obligatoires sont présentes
      if (!ticketCode || !ticketId) {
        return res.status(400).json(
          errorResponse('Ticket code et ticket ID requis', null, 'INVALID_QR_DATA')
        );
      }

      // Préparation des données pour le service de génération de QR code
      const qrData = {
        id: ticketId,           // Identifiant unique du ticket
        eventId: eventId || null, // Identifiant de l'événement (peut être null)
        code: ticketCode,       // Code unique du ticket
        type: 'TICKET'         // Type de QR code
      };

      // Configuration des options de génération du QR code
      const qrOptions = {
        format,              // Format de sortie (base64, png, svg, pdf)
        size,                // Taille du QR code (small, medium, large)
        includeLogo: false,  // Inclure un logo ou non
        errorCorrection: 'M' // Niveau de correction d'erreur (L, M, Q, H)
      };

      // Appel au service pour générer le QR code
      const qrResult = await qrCodeService.generateTicketQRCode(qrData, qrOptions);
      
      // Vérification si la génération a échoué
      if (!qrResult.success) {
        return res.status(500).json(
          errorResponse(qrResult.error, null, 'QR_GENERATION_FAILED')
        );
      }

      // Enregistrement du succès dans les logs
      logger.info('QR code generated successfully', {
        ticketId,    // Identifiant du ticket
        ticketCode,  // Code du ticket
        format,      // Format utilisé
        size         // Taille choisie
      });

      // Retour du QR code généré avec succès
      return res.status(201).json(
        createdResponse('QR code généré avec succès', {
          ticketId,           // Identifiant du ticket
          ticketCode,         // Code du ticket
          qrCodeData: qrResult.qrCode,  // Données du QR code (base64 ou autre)
          checksum: qrResult.signature,  // Signature de vérification
          url: qrResult.url,            // URL du QR code si applicable
          generatedAt: qrResult.generatedAt  // Date de génération
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs avec détails
      logger.error('QR code generation failed', {
        error: error.message,  // Message d'erreur
        stack: error.stack     // Pile d'appels pour débogage
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 🎫 GÉNÉRATION DE TICKET COMPLET
  // ========================================
  
  /**
   * Génère un ticket unique complet (QR code + PDF)
   * Cette méthode crée un ticket avec toutes ses composantes
   * @param {Object} req - Requête Express avec les données complètes du ticket
   * @param {Object} res - Réponse Express pour retourner le ticket créé
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async generateTicket(req, res, next) {
    try {
      // Extraction des données du ticket et des options depuis la requête
      const { ticketData, options = {} } = req.body;
      
      // Vérification que les données obligatoires du ticket sont présentes
      if (!ticketData || !ticketData.id || !ticketData.eventId || !ticketData.userId) {
        return res.status(400).json(
          errorResponse('Données du ticket incomplètes', null, 'INVALID_TICKET_DATA')
        );
      }

      // Préparer les données pour le service QR
      const qrDataForService = {
        id: ticketData.id,
        eventId: ticketData.eventId,
        code: `${ticketData.id}-${ticketData.eventId}`, // Générer un code unique
        type: 'TICKET'
      };

      // Préparer les options QR
      const qrOptions = {
        format: options.qrFormat || 'base64',
        size: options.qrSize || 'medium',
        includeLogo: options.includeLogo || false,
        errorCorrection: 'M'
      };

      // Générer le QR code pour le ticket
      const qrResult = await qrCodeService.generateTicketQRCode(qrDataForService, qrOptions);
      
      // Vérification si la génération du QR code a échoué
      if (!qrResult.success) {
        return res.status(500).json(
          errorResponse(qrResult.error, null, 'TICKET_GENERATION_FAILED')
        );
      }

      // Initialiser le résultat de génération
      const generationResult = {
        ticketId: ticketData.id,
        qrCodeData: qrResult.qrCode,
        checksum: qrResult.signature,
        generatedAt: qrResult.generatedAt
      };

      // Générer le PDF si demandé
      if (options.pdfFormat !== false) {
        try {
          // Préparer les données pour le service PDF
          const eventData = {
            id: ticketData.eventId,
            title: ticketData.eventTitle || 'Événement',
            eventDate: ticketData.eventDate || new Date().toISOString(),
            location: ticketData.location || 'Non spécifié'
          };

          const userData = {
            first_name: ticketData.attendeeName?.split(' ')[0] || 'Participant',
            last_name: ticketData.attendeeName?.split(' ').slice(1).join(' ') || '',
            email: ticketData.attendeeEmail,
            phone: ticketData.attendeePhone || null
          };

          // Préparer les options PDF
          const pdfOptions = {
            templateId: options.templateId,
            customFields: options.customFields,
            ...options.pdfOptions
          };

          // Appeler le service PDF
          const pdfResult = await pdfService.generateTicketPDF(ticketData, eventData, userData, { pdfOptions });
          
          if (pdfResult.success) {
            generationResult.pdfData = {
              filename: pdfResult.filename,
              pdfBase64: pdfResult.pdfBase64,
              generatedAt: pdfResult.generatedAt
            };
          } else {
            logger.warn('PDF generation failed, returning QR only', {
              ticketId: ticketData.id,
              error: pdfResult.error
            });
          }
        } catch (pdfError) {
          logger.error('PDF generation error', {
            ticketId: ticketData.id,
            error: pdfError.message
          });
          // Continuer sans PDF plutôt que de tout échouer
        }
      }

      // Enregistrement du succès dans les logs
      logger.info('Ticket generated successfully', {
        ticketId: ticketData.id,
        eventId: ticketData.eventId,
        userId: ticketData.userId,
        hasPDF: !!generationResult.pdfData
      });

      // Retour du ticket généré avec succès
      return res.status(201).json(
        createdResponse('Ticket généré avec succès', generationResult)
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Ticket generation failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 📋 GÉNÉRATION EN LOT
  // ========================================
  
  /**
   * Génère plusieurs tickets en lot
   * Cette méthode traite une liste de tickets simultanément
   * @param {Object} req - Requête Express avec la liste des tickets
   * @param {Object} res - Réponse Express pour retourner les résultats
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async generateBatch(req, res, next) {
    try {
      // Extraction de la liste des tickets et des options
      const { tickets, batchOptions = {} } = req.body;
      
      // Vérification que la liste de tickets n'est pas vide
      if (!tickets || tickets.length === 0) {
        return res.status(400).json(
          errorResponse('Aucun ticket à générer', null, 'EMPTY_BATCH')
        );
      }

      // Appel au service de traitement en lot
      const batchResult = await batchService.generateBatchTickets(tickets, batchOptions);
      
      // Vérification si le traitement en lot a échoué
      if (!batchResult.success) {
        return res.status(500).json(
          errorResponse(batchResult.error, null, 'BATCH_GENERATION_FAILED')
        );
      }

      // Enregistrement du succès dans les logs
      logger.info('Batch tickets generated successfully', {
        ticketCount: tickets.length,
        batchId: batchResult.batchId
      });

      // Retour des résultats du traitement en lot
      return res.status(201).json(
        createdResponse('Tickets générés en lot avec succès', batchResult.data)
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Batch generation failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 📄 GÉNÉRATION DE PDF
  // ========================================
  
  /**
   * Génère un PDF pour un ticket existant
   * Cette méthode crée un document PDF à partir des données du ticket
   * @param {Object} req - Requête Express avec les données du ticket et de l'événement
   * @param {Object} res - Réponse Express pour retourner le PDF généré
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async generatePDF(req, res, next) {
    try {
      // Extraction des données du ticket, de l'événement et des options
      const { ticketData, eventData, options = {} } = req.body;
      
      // Vérification que les données obligatoires sont présentes
      if (!ticketData || !eventData) {
        return res.status(400).json(
          errorResponse('Données incomplètes pour la génération PDF', null, 'INVALID_PDF_DATA')
        );
      }

      // Construire les données utilisateur si non fournies
      const userData = req.body.userData || {
        first_name: ticketData.attendeeName?.split(' ')[0] || 'Participant',
        last_name: ticketData.attendeeName?.split(' ').slice(1).join(' ') || '',
        email: ticketData.attendeeEmail,
        phone: ticketData.attendeePhone || null
      };

      // Appel au service de génération de PDF
      const pdfResult = await pdfService.generateTicketPDF(ticketData, eventData, userData, options);
      
      // Vérification si la génération du PDF a échoué
      if (!pdfResult.success) {
        return res.status(500).json(
          errorResponse(pdfResult.error, null, 'PDF_GENERATION_FAILED')
        );
      }

      // Enregistrement du succès dans les logs
      logger.info('PDF ticket generated successfully', {
        ticketId: ticketData.id,
        eventId: eventData.id
      });

      // Retour du PDF généré avec succès
      return res.status(201).json(
        createdResponse('PDF généré avec succès', {
          ticketId: ticketData.id,
          filename: pdfResult.filename,
          pdfBase64: pdfResult.pdfBase64,
          generatedAt: pdfResult.generatedAt
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('PDF generation controller error', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 🔍 VALIDATION DE TICKET
  // ========================================
  
  /**
   * Valide un ticket (vérifie son authenticité)
   * Cette méthode vérifie si un ticket est valide et authentique
   * @param {Object} req - Requête Express avec les données de validation
   * @param {Object} res - Réponse Express pour retourner le résultat de validation
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async validateTicket(req, res, next) {
    try {
      // Extraction des données de validation
      const { ticketCode, ticketId, eventId } = req.body;
      
      // Vérification que les données obligatoires sont présentes
      if (!ticketCode || !ticketId) {
        return res.status(400).json(
          errorResponse('Ticket code et ticket ID requis', null, 'INVALID_VALIDATION_DATA')
        );
      }

      // Simulation de validation (remplacer par logique réelle)
      const isValid = true; // Simulation
      
      if (!isValid) {
        return res.status(400).json(
          errorResponse('Ticket invalide', null, 'INVALID_TICKET')
        );
      }

      // Enregistrement de la validation dans les logs
      logger.info('Ticket validated successfully', {
        ticketId,
        eventId
      });

      // Retour du résultat de validation
      return res.status(200).json(
        successResponse('Ticket validé avec succès', {
          ticketId,
          eventId,
          isValid: true,
          validatedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Ticket validation failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 📊 MÉTHODES DE RÉCUPÉRATION
  // ========================================
  
  /**
   * Récupère le QR code d'un ticket existant
   * @param {Object} req - Requête Express avec l'ID du ticket
   * @param {Object} res - Réponse Express pour retourner le QR code
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async getTicketQRCode(req, res, next) {
    try {
      // Extraction de l'ID du ticket depuis les paramètres de l'URL
      const { ticketId } = req.params;
      
      // Simulation de récupération du QR code (remplacer par logique réelle)
      const qrCodeData = 'simulated_qr_code_data';
      
      // Retour du QR code
      return res.status(200).json(
        successResponse('QR code récupéré avec succès', {
          ticketId,
          qrCodeData,
          retrievedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Get QR code failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  /**
   * Récupère le PDF d'un ticket existant
   * @param {Object} req - Requête Express avec l'ID du ticket
   * @param {Object} res - Réponse Express pour retourner le PDF
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async getTicketPDF(req, res, next) {
    try {
      // Extraction de l'ID du ticket depuis les paramètres de l'URL
      const { ticketId } = req.params;
      
      // Simulation de récupération du PDF (remplacer par logique réelle)
      const pdfData = 'simulated_pdf_data';
      
      // Retour du PDF
      return res.status(200).json(
        successResponse('PDF récupéré avec succès', {
          ticketId,
          pdfData,
          retrievedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Get PDF failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  /**
   * Récupère les détails complets d'un ticket
   * @param {Object} req - Requête Express avec l'ID du ticket
   * @param {Object} res - Réponse Express pour retourner les détails
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async getTicketDetails(req, res, next) {
    try {
      // Extraction de l'ID du ticket depuis les paramètres de l'URL
      const { ticketId } = req.params;
      
      // Simulation de récupération des détails (remplacer par logique réelle)
      const ticketDetails = {
        id: ticketId,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      // Retour des détails du ticket
      return res.status(200).json(
        successResponse('Détails du ticket récupérés avec succès', ticketDetails)
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Get ticket details failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  /**
   * Récupère tous les tickets d'un événement
   * @param {Object} req - Requête Express avec l'ID de l'événement
   * @param {Object} res - Réponse Express pour retourner la liste des tickets
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async getEventTickets(req, res, next) {
    try {
      // Extraction de l'ID de l'événement depuis les paramètres de l'URL
      const { eventId } = req.params;
      
      // Simulation de récupération des tickets (remplacer par logique réelle)
      const tickets = []; // Liste vide pour simulation
      
      // Retour de la liste des tickets
      return res.status(200).json(
        successResponse('Event tickets retrieved successfully', {
          tickets,
          pagination: {
            page: 1,
            limit: 50,
            total: 0
          }
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Get event tickets failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 🔄 RÉGÉNÉRATION ET SUPPRESSION
  // ========================================
  
  /**
   * Régénère un ticket existant
   * @param {Object} req - Requête Express avec l'ID du ticket et les options de régénération
   * @param {Object} res - Réponse Express pour retourner le ticket régénéré
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async regenerateTicket(req, res, next) {
    try {
      // Extraction de l'ID du ticket depuis les paramètres et des options depuis le corps
      const { ticketId } = req.params;
      const { reason, regenerateQR = true, regeneratePDF = true } = req.body;
      
      // Appel au service de régénération
      const regenerateResult = await batchService.regenerateTicket(ticketId, {
        reason,
        regenerateQR,
        regeneratePDF
      });
      
      // Vérification si la régénération a échoué
      if (!regenerateResult.success) {
        return res.status(500).json(
          errorResponse('Échec de régénération du ticket', regenerateResult.error, 'TICKET_REGENERATION_FAILED')
        );
      }
      
      // Retour du ticket régénéré avec succès
      return res.status(200).json(
        successResponse('Ticket régénéré avec succès', regenerateResult.data)
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Ticket regeneration failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  /**
   * Supprime un ticket
   * @param {Object} req - Requête Express avec l'ID du ticket à supprimer
   * @param {Object} res - Réponse Express pour confirmer la suppression
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async deleteTicket(req, res, next) {
    try {
      // Extraction de l'ID du ticket depuis les paramètres de l'URL
      const { ticketId } = req.params;
      
      // Simulation de suppression (remplacer par logique réelle)
      const deleted = true;
      
      if (!deleted) {
        return res.status(404).json(
          errorResponse('Ticket non trouvé', null, 'TICKET_NOT_FOUND')
        );
      }
      
      // Enregistrement de la suppression dans les logs
      logger.info('Ticket deleted successfully', { ticketId });
      
      // Retour de la confirmation de suppression
      return res.status(200).json(
        successResponse('Ticket supprimé avec succès', {
          ticketId,
          deletedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Ticket deletion failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // 📋 GÉNÉRATION DE PDF EN LOT
  // ========================================
  
  /**
   * Génère plusieurs PDFs en lot
   * @param {Object} req - Requête Express avec la liste des tickets et options
   * @param {Object} res - Réponse Express pour retourner les PDFs générés
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async generateBatchPDF(req, res, next) {
    try {
      // Extraction des données de la requête
      const { tickets, eventData, options = {} } = req.body;
      
      // Vérification que la liste de tickets n'est pas vide
      if (!tickets || tickets.length === 0) {
        return res.status(400).json(
          errorResponse('Aucun ticket à traiter', null, 'EMPTY_BATCH')
        );
      }

      // Appel au service de génération de PDF en lot
      const batchResult = await batchService.generateBatchPDFs(tickets, eventData, options);
      
      // Vérification si la génération en lot a échoué
      if (!batchResult.success) {
        return res.status(500).json(
          errorResponse('Échec de création du job PDF batch: ' + batchResult.error, null, 'BATCH_PDF_JOB_CREATION_FAILED')
        );
      }
      
      // Retour des résultats de la génération en lot
      return res.status(201).json(
        createdResponse('PDFs générés en lot avec succès', batchResult.data)
      );
    } catch (error) {
      // En cas d'erreur, on l'enregistre dans les logs
      logger.error('Batch PDF generation failed', {
        error: error.message,
        stack: error.stack
      });
      // Passage de l'erreur au middleware de gestion d'erreurs
      next(error);
    }
  }

  // ========================================
  // MÉTHODES MANQUANTES POUR LES TEMPLATES EMAIL
  // ========================================

  /**
   * Télécharge un ticket spécifique
   * @param {Object} req - Requête Express avec l'ID du ticket
   * @param {Object} res - Réponse Express pour retourner le PDF
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async downloadTicket(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      // Récupérer les détails du ticket
      const ticketDetails = await batchService.getTicketDetails(ticketId);
      
      if (!ticketDetails.success) {
        return res.status(404).json(
          errorResponse('Ticket non trouvé', null, 'TICKET_NOT_FOUND')
        );
      }

      const ticketData = {
        id: ticketDetails.data.ticketId || ticketId,
        eventId: ticketDetails.data.eventId || 'event_1',
        userId: ticketDetails.data.userId || '1',
        type: ticketDetails.data.ticketType || 'standard',
        attendeeName: ticketDetails.data.attendeeName || 'Participant',
        attendeeEmail: ticketDetails.data.attendeeEmail || 'participant@example.com',
        attendeePhone: ticketDetails.data.attendeePhone || null,
        eventTitle: ticketDetails.data.eventTitle || 'Événement',
        eventDate: ticketDetails.data.eventDate || new Date().toISOString(),
        location: ticketDetails.data.location || 'Non spécifié'
      };

      const eventData = {
        id: ticketData.eventId,
        title: ticketData.eventTitle,
        eventDate: ticketData.eventDate,
        location: ticketData.location
      };

      const userData = {
        first_name: ticketData.attendeeName.split(' ')[0] || 'Participant',
        last_name: ticketData.attendeeName.split(' ').slice(1).join(' ') || '',
        email: ticketData.attendeeEmail,
        phone: ticketData.attendeePhone
      };

      // Générer le PDF du ticket
      const pdfResult = await pdfService.generateTicketPDF(ticketData, eventData, userData);
      
      if (!pdfResult.success) {
        return res.status(500).json(
          errorResponse('Échec de génération du PDF', null, 'PDF_GENERATION_FAILED')
        );
      }

      // Envoyer le fichier PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketId}.pdf"`);
      res.send(pdfResult.pdfBuffer);
      
      logger.info('Ticket downloaded successfully', { ticketId });
    } catch (error) {
      logger.error('Ticket download failed', {
        ticketId: req.params.ticketId,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Obtient le code QR d'un ticket
   * @param {Object} req - Requête Express avec l'ID du ticket
   * @param {Object} res - Réponse Express pour retourner l'image du QR
   * @param {Function} next - Middleware suivant en cas d'erreur
   */
  async getTicketQR(req, res, next) {
    try {
      const { ticketId } = req.params;
      
      // Récupérer les détails du ticket
      const ticketDetails = await batchService.getTicketDetails(ticketId);
      
      if (!ticketDetails.success) {
        return res.status(404).json(
          errorResponse('Ticket non trouvé', null, 'TICKET_NOT_FOUND')
        );
      }

      const ticketData = {
        id: ticketDetails.data.ticketId || ticketId,
        eventId: ticketDetails.data.eventId || 'event_1',
        userId: ticketDetails.data.userId || '1',
        type: ticketDetails.data.ticketType || 'standard'
      };

      // Générer le code QR du ticket
      const qrResult = await qrCodeService.generateTicketQRCode(ticketData, {
        size: 'medium',
        format: 'png'
      });
      
      if (!qrResult.success) {
        return res.status(500).json(
          errorResponse('Échec de génération du code QR', null, 'QR_GENERATION_FAILED')
        );
      }

      // Envoyer l'image du code QR
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1 heure
      res.send(qrResult.qrCodeBuffer);
      
      logger.info('Ticket QR generated successfully', { ticketId });
    } catch (error) {
      logger.error('Ticket QR generation failed', {
        ticketId: req.params.ticketId,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

// ========================================
// 📤 EXPORTATION DU CONTRÔLEUR
// ========================================
// Exporte une instance du contrôleur pour l'utiliser dans les routes
module.exports = new TicketsController();
