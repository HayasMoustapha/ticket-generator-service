const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const qrCodeService = require('../qrcode/qrcode.service');
const logger = require('../../utils/logger');

/**
 * Service de génération de PDF pour les tickets d'événements
 * Crée des tickets PDF personnalisables avec QR codes intégrés
 */
class PDFService {
  constructor() {
    this.defaultOptions = {
      size: 'A4',
      margins: {
        top: parseInt(process.env.PDF_MARGIN) || 50,
        bottom: parseInt(process.env.PDF_MARGIN) || 50,
        left: parseInt(process.env.PDF_MARGIN) || 50,
        right: parseInt(process.env.PDF_MARGIN) || 50
      },
      headerHeight: parseInt(process.env.PDF_HEADER_HEIGHT) || 80,
      footerHeight: parseInt(process.env.PDF_FOOTER_HEIGHT) || 40,
      fontSize: parseInt(process.env.PDF_FONT_SIZE) || 12,
      info: {
        Title: 'Event Ticket',
        Author: 'Event Planner',
        Subject: 'Event Admission Ticket',
        Creator: 'Event Planner Ticket Generator'
      }
    };

    this.templatesPath = path.join(__dirname, 'templates');
    this.ensureTemplatesDirectory();
  }

  /**
   * Génère un PDF ticket complet
   * @param {Object} ticketData - Données du ticket
   * @param {Object} eventData - Données de l'événement
   * @param {Object} userData - Données de l'utilisateur
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} PDF généré
   */
  async generateTicketPDF(ticketData, eventData, userData, options = {}) {
    try {
      const doc = new PDFDocument({ ...this.defaultOptions, ...options });
      
      // Ajouter les métadonnées
      doc.info.Title = `Ticket ${ticketData.id} - ${eventData.title}`;
      doc.info.Subject = `Admission ticket for ${eventData.title}`;
      
      // Générer le contenu du PDF
      await this.addHeader(doc, eventData);
      await this.addTicketContent(doc, ticketData, eventData, userData);
      await this.addFooter(doc, ticketData);
      
      // Finaliser le document
      doc.end();
      
      // Récupérer le buffer
      const pdfBuffer = await new Promise((resolve, reject) => {
        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
      });

      // Convertir en base64 pour stockage
      const pdfBase64 = pdfBuffer.toString('base64');
      
      logger.info('PDF ticket generated successfully', {
        ticketId: ticketData.id,
        eventId: eventData.id,
        size: pdfBuffer.length
      });

      return {
        success: true,
        pdfBuffer,
        pdfBase64,
        filename: `ticket-${ticketData.id}.pdf`,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to generate PDF ticket', {
        ticketId: ticketData.id,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération du PDF: ${error.message}`
      };
    }
  }

  /**
   * Ajoute l'en-tête du PDF
   * @param {PDFDocument} doc - Document PDF
   * @param {Object} eventData - Données de l'événement
   */
  async addHeader(doc, eventData) {
    const { margins, headerHeight } = this.defaultOptions;
    
    // Rectangle de l'en-tête
    doc.rect(margins.left, doc.page.height - margins.top - headerHeight, 
               doc.page.width - margins.left - margins.right, headerHeight);
    
    // Titre de l'événement
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text(eventData.title, margins.left + 50, doc.page.height - margins.top - 50);
    
    // Date et lieu
    doc.fontSize(14)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(this.formatDate(eventData.eventDate), margins.left + 50, doc.page.height - margins.top - 80);
    
    if (eventData.location) {
      doc.text(`📍 ${eventData.location}`, margins.left + 50, doc.page.height - margins.top - 100);
    }
    
    // Ligne de séparation
    doc.moveTo(margins.left, doc.page.height - margins.top - headerHeight - 10)
       .lineTo(doc.page.width - margins.right, doc.page.height - margins.top - headerHeight - 10)
       .lineWidth(1)
       .strokeColor('#bdc3c7')
       .stroke();
  }

  /**
   * Ajoute le contenu principal du ticket
   * @param {PDFDocument} doc - Document PDF
   * @param {Object} ticketData - Données du ticket
   * @param {Object} eventData - Données de l'événement
   * @param {Object} userData - Données de l'utilisateur
   */
  async addTicketContent(doc, ticketData, eventData, userData) {
    const { margins, headerHeight, footerHeight } = this.defaultOptions;
    let yPosition = doc.page.height - margins.top - headerHeight - 40;
    
    // Section Ticket Info
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('INFORMATIONS DU TICKET', margins.left + 50, yPosition);
    
    yPosition += 30;
    
    // Détails du ticket
    const ticketInfo = [
      { label: 'Numéro de ticket:', value: `#${ticketData.id}` },
      { label: 'Type:', value: ticketData.type || 'Standard' },
      { label: 'Prix:', value: this.formatPrice(ticketData.price) },
      { label: 'Statut:', value: this.getTicketStatus(ticketData.status) }
    ];
    
    ticketInfo.forEach(info => {
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#34495e')
         .text(info.label, margins.left + 50, yPosition);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(info.value, margins.left + 200, yPosition);
      
      yPosition += 20;
    });
    
    yPosition += 20;
    
    // Section Participant
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('INFORMATIONS DU PARTICIPANT', margins.left + 50, yPosition);
    
    yPosition += 30;
    
    const participantInfo = [
      { label: 'Nom:', value: `${userData.first_name} ${userData.last_name}` },
      { label: 'Email:', value: userData.email },
      { label: 'Téléphone:', value: userData.phone || 'Non spécifié' }
    ];
    
    participantInfo.forEach(info => {
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#34495e')
         .text(info.label, margins.left + 50, yPosition);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(info.value, margins.left + 200, yPosition);
      
      yPosition += 20;
    });
    
    yPosition += 30;
    
    // Espace pour le QR code
    const qrCodeSize = 150;
    const qrCodeX = (doc.page.width - qrCodeSize) / 2;
    const qrCodeY = yPosition;
    
    // Placeholder pour le QR code
    doc.rect(qrCodeX, qrCodeY, qrCodeSize, qrCodeSize);
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text('QR Code', qrCodeX + 50, qrCodeY + qrCodeSize / 2);
    
    // Légende du QR code
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text('Scannez ce code pour valider votre entrée', qrCodeX - 20, qrCodeY + qrCodeSize + 20);
    
    yPosition = qrCodeY + qrCodeSize + 60;
    
    // Instructions importantes
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#e74c3c')
       .text('INSTRUCTIONS IMPORTANTES:', margins.left + 50, yPosition);
    
    yPosition += 20;
    
    const instructions = [
      '• Présentez ce ticket à l\'entrée',
      '• Ce ticket est personnel et non transférable',
      '• Conservez ce ticket jusqu\'à la fin de l\'événement',
      '• En cas de perte, contactez l\'organisateur'
    ];
    
    instructions.forEach(instruction => {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#34495e')
         .text(instruction, margins.left + 50, yPosition);
      yPosition += 15;
    });
  }

  /**
   * Ajoute le pied de page du PDF
   * @param {PDFDocument} doc - Document PDF
   * @param {Object} ticketData - Données du ticket
   */
  async addFooter(doc, ticketData) {
    const { margins, footerHeight } = this.defaultOptions;
    const footerY = margins.bottom;
    
    // Ligne de séparation
    doc.moveTo(margins.left, footerY + footerHeight)
       .lineTo(doc.page.width - margins.right, footerY + footerHeight)
       .lineWidth(1)
       .strokeColor('#bdc3c7')
       .stroke();
    
    // Informations du pied de page
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(`Ticket ID: ${ticketData.id}`, margins.left, footerY + 20);
    
    doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, margins.left + 200, footerY + 20);
    
    // Numéro de page
    const pageNumber = doc.bufferedPageRange().start + 1;
    doc.text(`Page ${pageNumber}`, doc.page.width - margins.right - 50, footerY + 20);
  }

  /**
   * Génère un PDF pour un lot de tickets
   * @param {Array} tickets - Liste des tickets
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options de génération
   * @returns {Promise<Object>} PDF batch généré
   */
  async generateBatchPDF(tickets, eventData, options = {}) {
    try {
      const doc = new PDFDocument({ ...this.defaultOptions, ...options });
      
      // Ajouter les métadonnées
      doc.info.Title = `Batch Tickets - ${eventData.title}`;
      doc.info.Subject = `Batch admission tickets for ${eventData.title}`;
      
      let yPosition = doc.page.height - this.defaultOptions.margins.top;
      
      // Page de garde
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text('LOT DE TICKETS', doc.page.width / 2 - 80, yPosition, { align: 'center' });
      
      yPosition += 40;
      
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#34495e')
         .text(`Événement: ${eventData.title}`, doc.page.width / 2 - 100, yPosition, { align: 'center' });
      
      yPosition += 20;
      doc.text(`Nombre de tickets: ${tickets.length}`, doc.page.width / 2 - 80, yPosition, { align: 'center' });
      
      yPosition += 30;
      
      // Liste des tickets
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Liste des tickets:', this.defaultOptions.margins.left + 50, yPosition);
      
      yPosition += 20;
      
      tickets.forEach((ticket, index) => {
        doc.fontSize(10)
           .font('Helvetica')
           .text(`${index + 1}. Ticket #${ticket.id} - ${ticket.type || 'Standard'} - ${this.formatPrice(ticket.price)}`, 
                  this.defaultOptions.margins.left + 70, yPosition);
        yPosition += 15;
        
        // Nouvelle page si nécessaire
        if (yPosition > doc.page.height - 100) {
          doc.addPage();
          yPosition = doc.page.height - this.defaultOptions.margins.top;
        }
      });
      
      // Finaliser le document
      doc.end();
      
      const pdfBuffer = await new Promise((resolve, reject) => {
        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
      });

      const pdfBase64 = pdfBuffer.toString('base64');
      
      logger.info('Batch PDF generated successfully', {
        eventId: eventData.id,
        ticketsCount: tickets.length,
        size: pdfBuffer.length
      });

      return {
        success: true,
        pdfBuffer,
        pdfBase64,
        filename: `batch-tickets-${eventData.id}.pdf`,
        ticketsCount: tickets.length,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to generate batch PDF', {
        eventId: eventData.id,
        ticketsCount: tickets.length,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de génération du PDF batch: ${error.message}`
      };
    }
  }

  /**
   * Intègre un QR code dans un PDF existant
   * @param {Buffer} pdfBuffer - Buffer du PDF existant
   * @param {Buffer} qrCodeBuffer - Buffer du QR code
   * @param {Object} options - Options d'intégration
   * @returns {Promise<Object>} PDF avec QR code intégré
   */
  async integrateQRCode(pdfBuffer, qrCodeBuffer, options = {}) {
    try {
      // Cette méthode nécessite une bibliothèque comme pdfkit-image
      // Pour l'instant, retourner le PDF original
      
      logger.info('QR code integration (placeholder)', {
        pdfSize: pdfBuffer.length,
        qrCodeSize: qrCodeBuffer.length
      });

      return {
        success: true,
        pdfBuffer,
        hasQRCode: false,
        message: 'QR code integration not implemented yet'
      };
    } catch (error) {
      logger.error('Failed to integrate QR code', {
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec d'intégration du QR code: ${error.message}`
      };
    }
  }

  /**
   * Formate un prix en euros
   * @param {number} price - Prix en centimes
   * @returns {string} Prix formaté
   */
  formatPrice(price) {
    const euros = price / 100;
    return `${euros.toFixed(2)} €`;
  }

  /**
   * Formate une date
   * @param {string|Date} date - Date à formater
   * @returns {string} Date formatée
   */
  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Récupère le statut du ticket en français
   * @param {string} status - Statut du ticket
   * @returns {string} Statut formaté
   */
  getTicketStatus(status) {
    const statusMap = {
      'active': 'Actif',
      'used': 'Utilisé',
      'expired': 'Expiré',
      'cancelled': 'Annulé',
      'pending': 'En attente'
    };
    
    return statusMap[status] || status;
  }

  /**
   * Assure que le répertoire des templates existe
   */
  async ensureTemplatesDirectory() {
    try {
      await fs.mkdir(this.templatesPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error('Failed to create templates directory', { error: error.message });
      }
    }
  }

  /**
   * Sauvegarde un PDF sur le système de fichiers
   * @param {Buffer} pdfBuffer - Buffer du PDF
   * @param {string} filename - Nom du fichier
   * @returns {Promise<Object>} Résultat de la sauvegarde
   */
  async savePDF(pdfBuffer, filename) {
    try {
      const uploadPath = process.env.UPLOAD_PATH || './uploads';
      await fs.mkdir(uploadPath, { recursive: true });
      
      const filePath = path.join(uploadPath, filename);
      await fs.writeFile(filePath, pdfBuffer);
      
      return {
        success: true,
        filePath,
        size: pdfBuffer.length,
        savedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to save PDF', {
        filename,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de sauvegarde du PDF: ${error.message}`
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
    logger.info('PDF default options updated', { options: this.defaultOptions });
  }

  /**
   * Récupère un PDF de ticket
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object>} PDF du ticket
   */
  async getTicketPDF(ticketId) {
    try {
      // Logique pour récupérer le PDF depuis la base de données ou stockage
      const pdfData = await this.getPDFFromDatabase(ticketId);
      
      if (!pdfData) {
        return {
          success: false,
          error: 'PDF non trouvé pour ce ticket'
        };
      }
      
      return {
        success: true,
        data: pdfData
      };
    } catch (error) {
      logger.error('Error getting ticket PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Récupère le PDF depuis la base de données
   * @param {string} ticketId - ID du ticket
   * @returns {Promise<Object|null>} Données du PDF
   */
  async getPDFFromDatabase(ticketId) {
    try {
      // Implémentation de la récupération depuis la base de données
      // Pour l'instant, retourne des données mockées
      return {
        ticketId,
        pdfData: 'mock_pdf_data',
        format: 'base64',
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting PDF from database:', error);
      return null;
    }
  }
}

module.exports = new PDFService();
