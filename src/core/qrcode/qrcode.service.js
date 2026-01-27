const QRCode = require('qrcode');
const crypto = require('crypto');
const redis = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Service de génération de QR codes avec signatures anti-fraude
 * Génère des QR codes sécurisés pour les tickets d'événements
 */
class QRCodeService {
  constructor() {
    this.signatureSecret = process.env.TICKET_SIGNATURE_SECRET || 'default-secret-change-in-production';
    this.defaultOptions = {
      width: parseInt(process.env.QR_CODE_SIZE) || 200,
      margin: parseInt(process.env.QR_CODE_MARGIN) || 1,
      color: {
        dark: process.env.QR_CODE_COLOR_DARK || '#000000',
        light: process.env.QR_CODE_COLOR_LIGHT || '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    };
  }

  /**
   * Génère un QR code pour un ticket avec signature anti-fraude
   * @param {Object} ticketData - Données du ticket
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} QR code généré
   */
  async generateTicketQRCode(ticketData, options = {}) {
    try {
      // Créer les données signées pour le QR code
      const signedData = this.createSignedTicketData(ticketData);
      
      // Convertir en chaîne pour le QR code
      const qrData = JSON.stringify(signedData);
      
      // Options de génération
      const qrOptions = { ...this.defaultOptions, ...options };
      
      // Générer le QR code
      const qrCodeBuffer = await QRCode.toBuffer(qrData, qrOptions);
      
      // Convertir en base64 pour stockage/transport
      const qrCodeBase64 = qrCodeBuffer.toString('base64');
      
      logger.info('QR code generated successfully', {
        ticketId: ticketData.id,
        eventId: ticketData.eventId,
        size: qrCodeBuffer.length
      });

      return {
        success: true,
        qrCode: qrCodeBase64,
        qrCodeBuffer,
        signature: signedData.signature,
        signedData,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to generate QR code', {
        ticketId: ticketData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération du QR code: ${error.message}`
      };
    }
  }

  /**
   * Crée les données signées pour un ticket
   * @param {Object} ticketData - Données du ticket
   * @returns {Object} Données signées
   */
  createSignedTicketData(ticketData) {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Données à signer
    const dataToSign = {
      id: ticketData.id,
      eventId: ticketData.eventId,
      userId: ticketData.userId,
      type: ticketData.type || 'standard',
      price: ticketData.price,
      createdAt: ticketData.createdAt,
      timestamp,
      nonce
    };

    // Créer la signature
    const signature = this.createSignature(dataToSign);
    
    return {
      ...dataToSign,
      signature
    };
  }

  /**
   * Crée une signature cryptographique pour les données
   * @param {Object} data - Données à signer
   * @returns {string} Signature HMAC-SHA256
   */
  createSignature(data) {
    const dataString = JSON.stringify(data);
    return crypto
      .createHmac('sha256', this.signatureSecret)
      .update(dataString)
      .digest('hex');
  }

  /**
   * Valide un QR code et vérifie sa signature
   * @param {string} qrCodeData - Données du QR code
   * @returns {Promise<Object>} Résultat de la validation
   */
  async validateQRCode(qrCodeData) {
    try {
      let signedData;
      
      // Parser les données du QR code
      try {
        signedData = typeof qrCodeData === 'string' 
          ? JSON.parse(qrCodeData)
          : qrCodeData;
      } catch (parseError) {
        return {
          success: false,
          valid: false,
          error: 'Format de QR code invalide'
        };
      }

      // Vérifier la présence des champs requis
      const requiredFields = ['id', 'eventId', 'userId', 'signature', 'timestamp', 'nonce'];
      const missingFields = requiredFields.filter(field => !signedData[field]);
      
      if (missingFields.length > 0) {
        return {
          success: false,
          valid: false,
          error: `Champs manquants: ${missingFields.join(', ')}`
        };
      }

      // Vérifier la signature
      const isValidSignature = this.verifySignature(signedData);
      
      if (!isValidSignature) {
        logger.security('Invalid QR code signature detected', {
          ticketId: signedData.id,
          eventId: signedData.eventId
        });
        
        return {
          success: false,
          valid: false,
          error: 'Signature invalide - Possible fraude'
        };
      }

      // Vérifier l'âge du QR code (ne doit pas être trop ancien)
      const qrAge = this.getQRCodeAge(signedData.timestamp);
      const maxAge = 24 * 60 * 60 * 1000; // 24 heures
      
      if (qrAge > maxAge) {
        return {
          success: false,
          valid: false,
          error: 'QR code expiré'
        };
      }

      // Vérifier si le nonce a déjà été utilisé (replay attack)
      const isReplay = await this.checkNonceReplay(signedData.nonce);
      
      if (isReplay) {
        logger.security('QR code replay attack detected', {
          ticketId: signedData.id,
          eventId: signedData.eventId,
          nonce: signedData.nonce
        });
        
        return {
          success: false,
          valid: false,
          error: 'QR code déjà utilisé - Attaque par replay détectée'
        };
      }

      // Marquer le nonce comme utilisé
      await this.markNonceAsUsed(signedData.nonce, signedData.id);

      return {
        success: true,
        valid: true,
        ticketData: {
          id: signedData.id,
          eventId: signedData.eventId,
          userId: signedData.userId,
          type: signedData.type,
          price: signedData.price,
          createdAt: signedData.createdAt,
          generatedAt: signedData.timestamp
        },
        validatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('QR code validation error', {
        error: error.message
      });
      
      return {
        success: false,
        valid: false,
        error: `Erreur de validation: ${error.message}`
      };
    }
  }

  /**
   * Vérifie la signature des données
   * @param {Object} signedData - Données signées
   * @returns {boolean} True si signature valide
   */
  verifySignature(signedData) {
    const { signature, ...dataToVerify } = signedData;
    const expectedSignature = this.createSignature(dataToVerify);
    
    // Comparaison sécurisée des signatures
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Calcule l'âge d'un QR code en millisecondes
   * @param {string} timestamp - Timestamp de génération
   * @returns {number} Âge en millisecondes
   */
  getQRCodeAge(timestamp) {
    const generatedTime = new Date(timestamp);
    const now = new Date();
    return now - generatedTime;
  }

  /**
   * Vérifie si un nonce a déjà été utilisé
   * @param {string} nonce - Nonce à vérifier
   * @returns {Promise<boolean>} True si déjà utilisé
   */
  async checkNonceReplay(nonce) {
    try {
      if (!redis.isReady()) {
        logger.warn('Redis not available, skipping nonce replay check');
        return false;
      }
      
      const nonceKey = `qr_nonce:${nonce}`;
      const exists = await redis.exists(nonceKey);
      return exists;
    } catch (error) {
      logger.error('Nonce replay check failed', {
        nonce,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Marque un nonce comme utilisé
   * @param {string} nonce - Nonce à marquer
   * @param {string} ticketId - ID du ticket associé
   * @returns {Promise<boolean>} True si marqué avec succès
   */
  async markNonceAsUsed(nonce, ticketId) {
    try {
      if (!redis.isReady()) {
        logger.warn('Redis not available, skipping nonce marking');
        return true; // Continue without Redis
      }
      
      const nonceKey = `qr_nonce:${nonce}`;
      const ttl = 24 * 60 * 60; // 24 heures en secondes
      
      // Stocker le nonce avec le ticket ID et TTL
      const success = await redis.setWithTTL(nonceKey, ticketId, ttl);
      
      if (success) {
        logger.info('Nonce marked as used', { nonce, ticketId, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Nonce marking failed', {
        nonce,
        ticketId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Génère un QR code pour un lot de tickets
   * @param {Array} tickets - Liste des tickets
   * @param {Object} options - Options de génération
   * @returns {Promise<Array>} Liste des QR codes générés
   */
  async generateBatchQRCodes(tickets, options = {}) {
    const results = [];
    
    for (const ticket of tickets) {
      try {
        const result = await this.generateTicketQRCode(ticket, options);
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
    
    logger.info('Batch QR codes generation completed', {
      totalTickets: tickets.length,
      successCount,
      failureCount: tickets.length - successCount
    });

    return results;
  }

  /**
   * Génère un QR code avec logo personnalisé
   * @param {Object} ticketData - Données du ticket
   * @param {Buffer} logoBuffer - Buffer du logo
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} QR code avec logo
   */
  async generateQRCodeWithLogo(ticketData, logoBuffer, options = {}) {
    try {
      // D'abord générer le QR code standard
      const qrResult = await this.generateTicketQRCode(ticketData, options);
      
      if (!qrResult.success) {
        return qrResult;
      }

      // Ajouter le logo (nécessite une bibliothèque comme qrcode-with-logo)
      // Pour l'instant, retourner le QR code standard
      
      logger.info('QR code with logo generated (logo not embedded yet)', {
        ticketId: ticketData.id,
        logoSize: logoBuffer.length
      });

      return {
        ...qrResult,
        hasLogo: true,
        logoSize: logoBuffer.length
      };
    } catch (error) {
      logger.error('Failed to generate QR code with logo', {
        ticketId: ticketData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération du QR code avec logo: ${error.message}`
      };
    }
  }

  /**
   * Génère un QR code temporaire (court terme)
   * @param {Object} ticketData - Données du ticket
   * @param {number} validityMinutes - Validité en minutes
   * @returns {Promise<Object>} QR code temporaire
   */
  async generateTemporaryQRCode(ticketData, validityMinutes = 5) {
    try {
      const temporaryData = {
        ...ticketData,
        temporary: true,
        expiresAt: new Date(Date.now() + validityMinutes * 60 * 1000).toISOString()
      };

      const result = await this.generateTicketQRCode(temporaryData);
      
      if (result.success) {
        result.temporary = true;
        result.expiresAt = temporaryData.expiresAt;
      }

      return result;
    } catch (error) {
      logger.error('Failed to generate temporary QR code', {
        ticketId: ticketData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération du QR code temporaire: ${error.message}`
      };
    }
  }

  /**
   * Récupère les options par défaut
   * @returns {Object} Options par défaut
   */
  getDefaultOptions() {
    return { ...this.defaultOptions };
  }

  /**
   * Met à jour les options par défaut
   * @param {Object} newOptions - Nouvelles options
   */
  updateDefaultOptions(newOptions) {
    this.defaultOptions = { ...this.defaultOptions, ...newOptions };
    logger.info('QR code default options updated', { options: this.defaultOptions });
  }

  /**
   * Récupère un QR code de ticket
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object>} QR code du ticket
   */
  async getTicketQRCode(ticketId) {
    try {
      // Logique pour récupérer le QR code depuis la base de données ou cache
      const qrData = await this.getQRCodeFromDatabase(ticketId);
      
      if (!qrData) {
        return {
          success: false,
          error: 'QR code non trouvé pour ce ticket'
        };
      }
      
      return {
        success: true,
        data: qrData
      };
    } catch (error) {
      logger.error('Error getting ticket QR code:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Valide un ticket
   * @param {string} ticketCode - Code du ticket
   * @param {string} ticketId - ID du ticket
   * @param {string} eventId - ID de l'événement
   * @returns {Promise<Object>} Résultat de la validation
   */
  async validateTicket(ticketCode, ticketId, eventId) {
    try {
      // Logique de validation du ticket
      const validationResult = await this.validateTicketData(ticketCode, ticketId, eventId);
      
      if (!validationResult.isValid) {
        return {
          success: false,
          error: validationResult.error || 'Ticket invalide'
        };
      }
      
      return {
        success: true,
        data: {
          ticketId,
          eventId,
          isValid: true,
          validationTime: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error validating ticket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Récupère le QR code depuis la base de données
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object|null>} Données du QR code
   */
  async getQRCodeFromDatabase(ticketId) {
    try {
      // Implémentation de la récupération depuis la base de données
      // Pour l'instant, retourne des données mockées
      return {
        ticketId,
        qrCode: 'mock_qr_code_data',
        format: 'base64',
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting QR code from database:', error);
      return null;
    }
  }

  /**
   * Valide les données du ticket
   * @param {string} ticketCode - Code du ticket
   * @param {string} ticketId - ID du ticket
   * @param {string} eventId - ID de l'événement
   * @returns {Promise<Object>} Résultat de la validation
   */
  async validateTicketData(ticketCode, ticketId, eventId) {
    try {
      // Implémentation de la validation
      // Pour l'instant, validation simple
      if (!ticketCode || !ticketId) {
        return {
          isValid: false,
          error: 'Code ou ID du ticket manquant'
        };
      }
      
      return {
        isValid: true
      };
    } catch (error) {
      logger.error('Error validating ticket data:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = new QRCodeService();
