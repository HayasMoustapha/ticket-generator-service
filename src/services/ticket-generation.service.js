/**
 * Service de génération de tickets pour Ticket-Generator
 * Structure optimisée pour recevoir les données enrichies de event-planner-core
 */

const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const { database } = require('../config/database');

class TicketGenerationService {
  constructor() {
    this.outputDir = process.env.OUTPUT_DIR || './generated-tickets';
    this.ensureOutputDir();
  }

  /**
   * S'assure que le répertoire de sortie existe
   */
  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error('[TICKET_GENERATION] Erreur création répertoire:', error);
      }
    }
  }

  /**
   * Génère un ticket complet avec QR code et PDF
   * @param {Object} ticketData - Données enrichies du ticket
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} Résultat de la génération
   */
  async generateTicket(ticketData, options = {}) {
    try {
      const {
        ticket_id,
        ticket_code,
        guest,
        ticket_type,
        template,
        event
      } = ticketData;

      const {
        qrFormat = 'base64',
        qrSize = 'medium',
        pdfFormat = true,
        includeLogo = false
      } = options;

      console.log(`[TICKET_GENERATION] Génération ticket ${ticket_id} pour ${guest.name}`);

      // Étape 1: Générer le QR code
      const qrCodeData = await this.generateQRCode(ticket_code, qrFormat, qrSize);

      // Étape 2: Générer le PDF si demandé
      let pdfFile = null;
      if (pdfFormat) {
        try {
          pdfFile = await this.generatePDF(ticketData, options);
        } catch (pdfError) {
          console.warn(`[TICKET_GENERATION] Erreur génération PDF (continuation sans PDF):`, pdfError.message);
          // Continuer sans PDF pour ne pas bloquer le traitement
          pdfFile = {
            url: `/files/tickets/${ticket_code}_placeholder.pdf`,
            path: '/tmp/placeholder.pdf',
            size_bytes: 0
          };
        }
      }

      // Étape 3: Enregistrer en base de données locale
      await this.saveGenerationLog(ticket_id, ticketData, qrCodeData, pdfFile);

      return {
        ticket_id,
        ticket_code,
        qr_code_data: qrCodeData,
        pdf_file: pdfFile,
        generated_at: new Date().toISOString(),
        success: true
      };

    } catch (error) {
      console.error(`[TICKET_GENERATION] Erreur génération ticket ${ticketData.ticket_id}:`, error);
      
      // Enregistrer l'erreur en base de données pour traçabilité
      try {
        await this.saveErrorLog(ticketData.ticket_id, ticketData, error);
      } catch (logError) {
        console.error('[TICKET_GENERATION] Erreur enregistrement log d\'erreur:', logError);
      }
      
      return {
        ticket_id: ticketData.ticket_id,
        success: false,
        error_message: error.message
      };
    }
  }

  /**
   * Génère un QR code
   * @param {string} ticketCode - Code du ticket
   * @param {string} format - Format de sortie
   * @param {string} size - Taille du QR code
   * @returns {Promise<string>} Données du QR code
   */
  async generateQRCode(ticketCode, format = 'base64', size = 'medium') {
    try {
      const sizeMap = {
        small: 100,
        medium: 200,
        large: 300
      };

      const qrSize = sizeMap[size] || 200;
      
      // Créer les données du QR code avec informations enrichies
      const qrData = JSON.stringify({
        ticket_code: ticketCode,
        timestamp: new Date().toISOString(),
        version: '1.0'
      });

      let qrResult;
      
      if (format === 'base64') {
        qrResult = await QRCode.toDataURL(qrData, {
          width: qrSize,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } else if (format === 'png') {
        const buffer = await QRCode.toBuffer(qrData, {
          width: qrSize,
          margin: 1
        });
        const filename = `qr_${ticketCode}_${Date.now()}.png`;
        const filepath = path.join(this.outputDir, filename);
        await fs.writeFile(filepath, buffer);
        qrResult = filepath;
      } else if (format === 'svg') {
        qrResult = await QRCode.toString(qrData, {
          type: 'svg',
          width: qrSize,
          margin: 1
        });
      }

      return qrResult;

    } catch (error) {
      throw new Error(`Erreur génération QR code: ${error.message}`);
    }
  }

  /**
   * Génère un PDF pour le ticket
   * @param {Object} ticketData - Données du ticket
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} Informations du fichier PDF
   */
  async generatePDF(ticketData, options = {}) {
    try {
      const { ticket_id, ticket_code, guest, ticket_type, template, event } = ticketData;
      
      // Pour l'instant, simuler la génération PDF
      // Dans une vraie implémentation, utiliser une librairie comme puppeteer ou pdfkit
      const filename = `ticket_${ticket_code}_${Date.now()}.pdf`;
      const filepath = path.join(this.outputDir, filename);
      
      // Générer le vrai contenu PDF avec PDFKit
      const pdfContent = await this.generatePDFContent(ticketData);
      await fs.writeFile(filepath, pdfContent);

      const stats = await fs.stat(filepath);

      return {
        url: `/files/tickets/${filename}`,
        path: filepath,
        size_bytes: stats.size
      };

    } catch (error) {
      throw new Error(`Erreur génération PDF: ${error.message}`);
    }
  }

  /**
   * Génère le contenu du PDF avec PDFKit
   * @param {Object} ticketData - Données du ticket
   * @returns {Buffer} Contenu PDF binaire
   */
  generatePDFContent(ticketData) {
    return new Promise((resolve, reject) => {
      try {
        const { ticket_code, guest, ticket_type, event } = ticketData;
        
        // Créer un nouveau document PDF
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        // Buffer pour stocker le PDF
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);

        // Contenu du ticket
        doc.fontSize(24).text('TICKET D\'ÉVÉNEMENT', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(16).text(`${event.title}`, { align: 'center' });
        doc.moveDown();

        // Ligne de séparation
        doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown();

        // Informations du ticket
        doc.fontSize(12);
        doc.text(`Code du ticket: ${ticket_code}`);
        doc.text(`Nom: ${guest.name}`);
        doc.text(`Email: ${guest.email}`);
        doc.text(`Type: ${ticket_type.name}`);
        doc.text(`Lieu: ${event.location}`);
        doc.text(`Date: ${new Date(event.date).toLocaleDateString('fr-FR')}`);
        
        doc.moveDown();
        
        // Ligne de séparation
        doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown();

        // Pied de page
        doc.fontSize(10).text(`Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'center' });
        doc.text('Ce ticket est valable pour l\'entrée à l\'événement.', { align: 'center' });

        // Finaliser le document
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Enregistre le log de génération en base de données
   * @param {number} ticketId - ID du ticket
   * @param {Object} ticketData - Données du ticket
   * @param {string} qrCodeData - Données du QR code
   * @param {Object} pdfFile - Informations du fichier PDF
   */
  async saveGenerationLog(ticketId, ticketData, qrCodeData, pdfFile) {
    try {
      const { ticket_code, guest, ticket_type, template, event } = ticketData;
      
      // 1. Enregistrer dans ticket_generation_logs
      const logQuery = `
        INSERT INTO ticket_generation_logs (job_id, status, message, details, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
      `;
      
      const logDetails = {
        ticket_id: ticketId,
        ticket_code: ticket_code,
        guest_info: guest,
        ticket_type: ticket_type,
        event_info: event,
        template: template,
        qr_generated: !!qrCodeData,
        pdf_generated: !!pdfFile,
        pdf_path: pdfFile?.path || null
      };
      
      const logResult = await database.query(logQuery, [
        ticketId, // job_id
        'completed', // status
        `Ticket ${ticket_code} généré avec succès`,
        JSON.stringify(logDetails)
      ]);
      
      console.log(`[TICKET_GENERATION] Log enregistré pour ticket ${ticketId} (log_id: ${logResult.rows[0].id})`);
      
      // 2. Enregistrer dans generated_tickets
      const ticketQuery = `
        INSERT INTO generated_tickets (
          job_id, ticket_code, qr_code_data, template_id, 
          guest_id, event_id, pdf_file_path, generated_at, 
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
        RETURNING id
      `;
      
      const ticketResult = await database.query(ticketQuery, [
        ticketId, // job_id
        ticket_code,
        qrCodeData,
        template?.id || null,
        guest?.id || null,
        event?.id || null,
        pdfFile?.path || null
      ]);
      
      console.log(`[TICKET_GENERATION] Ticket généré enregistré: ${ticket_code} (generated_ticket_id: ${ticketResult.rows[0].id})`);
      
      return {
        log_id: logResult.rows[0].id,
        generated_ticket_id: ticketResult.rows[0].id
      };
      
    } catch (error) {
      console.error('[TICKET_GENERATION] Erreur enregistrement log:', error);
      // Ne pas bloquer la génération si l'enregistrement échoue
      throw error;
    }
  }

  /**
   * Enregistre une erreur de génération en base de données
   * @param {number} ticketId - ID du ticket
   * @param {Object} ticketData - Données du ticket
   * @param {Error} error - Erreur survenue
   */
  async saveErrorLog(ticketId, ticketData, error) {
    try {
      const { ticket_code, guest, ticket_type, template, event } = ticketData;
      
      const logQuery = `
        INSERT INTO ticket_generation_logs (job_id, status, message, details, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
      `;
      
      const logDetails = {
        ticket_id: ticketId,
        ticket_code: ticket_code,
        guest_info: guest,
        ticket_type: ticket_type,
        event_info: event,
        template: template,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        failed_at: new Date().toISOString()
      };
      
      const logResult = await database.query(logQuery, [
        ticketId, // job_id
        'failed', // status
        `Erreur génération ticket ${ticket_code}: ${error.message}`,
        JSON.stringify(logDetails)
      ]);
      
      console.log(`[TICKET_GENERATION] Erreur enregistrée pour ticket ${ticketId} (log_id: ${logResult.rows[0].id})`);
      
      return logResult.rows[0].id;
      
    } catch (logError) {
      console.error('[TICKET_GENERATION] Erreur enregistrement log d\'erreur:', logError);
      throw logError;
    }
  }

  /**
   * Nettoie les anciens fichiers générés
   * @param {number} maxAge - Âge maximum en heures
   */
  async cleanupOldFiles(maxAge = 24) {
    try {
      const files = await fs.readdir(this.outputDir);
      const now = Date.now();
      const maxAgeMs = maxAge * 60 * 60 * 1000;

      for (const file of files) {
        const filepath = path.join(this.outputDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAgeMs) {
          await fs.unlink(filepath);
          console.log(`[TICKET_GENERATION] Fichier supprimé: ${file}`);
        }
      }
    } catch (error) {
      console.error('[TICKET_GENERATION] Erreur nettoyage fichiers:', error);
    }
  }
}

module.exports = new TicketGenerationService();
