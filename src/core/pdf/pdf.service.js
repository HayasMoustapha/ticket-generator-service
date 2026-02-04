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
        top: 40,
        bottom: 40,
        left: 40,
        right: 40
      },
      headerHeight: 60,
      footerHeight: 30,
      fontSize: 10,
      info: {
        Title: 'Event Ticket',
        Author: 'Event Planner',
        Subject: 'Event Admission Ticket',
        Creator: 'Event Planner Ticket Generator'
      }
    };

    // Design constants pour le style ticket avec souche
    this.ticketWidth = 320; // Largeur du ticket principal
    this.stubWidth = 120;  // Largeur de la souche
    this.totalWidth = this.ticketWidth + this.stubWidth + 10; // +10 pour la perforation
    this.ticketHeight = 200;

    this.templatesPath = path.join(__dirname, 'templates');
    this.ensureTemplatesDirectory();
  }

  /**
   * Dessine un ticket minimaliste avec souche détachable
   * @param {PDFDocument} doc - Document PDF
   * @param {Object} ticketData - Données du ticket
   * @param {Object} eventData - Données de l'événement
   * @param {Object} userData - Données de l'utilisateur
   * @param {number} startX - Position X de départ
   * @param {number} startY - Position Y de départ
   */
  async drawEventTicketWithStub(doc, ticketData, eventData, userData, startX, startY) {
    // Fond blanc simple
    doc.rect(startX, startY, this.totalWidth, this.ticketHeight)
       .fill('#ffffff');

    // Bordure simple
    doc.rect(startX, startY, this.totalWidth, this.ticketHeight)
       .lineWidth(2)
       .strokeColor('#333333')
       .stroke();

    // === TICKET PRINCIPAL (gauche) ===
    const ticketX = startX;
    const ticketY = startY;
    
    // Ligne de séparation verticale
    doc.moveTo(ticketX + this.ticketWidth, ticketY)
       .lineTo(ticketX + this.ticketWidth, ticketY + this.ticketHeight)
       .lineWidth(1)
       .strokeColor('#cccccc')
       .stroke();

    // Numéro du ticket
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(`Ticket #${ticketData.id}`, ticketX + 20, ticketY + 20);

    // Titre de l'événement
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(eventData.title, ticketX + 20, ticketY + 45, { 
         width: this.ticketWidth - 40
       });

    // Date
    const eventDate = this.formatDate(eventData.event_date);
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text(eventDate || 'Date à confirmer', ticketX + 20, ticketY + 80);

    // Lieu
    if (eventData.location) {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#666666')
         .text(eventData.location, ticketX + 20, ticketY + 100);
    }

    // Nom du participant
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#333333')
       .text(`${userData.first_name} ${userData.last_name}`, ticketX + 20, ticketY + 130);

    // Type de ticket
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#999999')
       .text(ticketData.type || 'Standard', ticketX + 20, ticketY + 150);

    // Prix
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(this.formatPrice(ticketData.price), ticketX + 20, ticketY + 170);

    // === SOUCHE DÉTACHABLE (droite) ===
    const stubX = ticketX + this.ticketWidth;
    const stubY = ticketY;
    
    // Ligne de perforation
    doc.moveTo(stubX, stubY + 30)
       .lineTo(stubX, stubY + this.ticketHeight - 30)
       .lineWidth(1)
       .strokeColor('#999999')
       .dash(3, 3)
       .stroke();
    doc.undash();

    // QR Code dans la souche
    try {
      const qrResult = await qrCodeService.generateTicketQRCode({
        id: ticketData.id,
        eventId: eventData.id,
        userId: userData.id,
        type: ticketData.type,
        price: ticketData.price,
        createdAt: ticketData.createdAt
      });
      
      if (qrResult.success && qrResult.qrCodeBuffer) {
        // QR code centré
        const qrSize = 80;
        const qrXPos = stubX + (this.stubWidth - qrSize) / 2;
        
        doc.image(qrResult.qrCodeBuffer, qrXPos, stubY + 40, { 
          width: qrSize, 
          height: qrSize 
        });
        
        // Numéro sous QR code
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text(`#${ticketData.id}`, stubX + 10, stubY + 130, { 
             width: this.stubWidth - 20, 
             align: 'center' 
           });
        
      } else {
        // Placeholder simple
        doc.fontSize(8)
           .fillColor('#999999')
           .text('QR Code', stubX + 10, stubY + 80, { width: this.stubWidth - 20, align: 'center' });
      }
    } catch (qrError) {
      // Placeholder erreur
      doc.fontSize(8)
         .fillColor('#999999')
         .text('Erreur QR', stubX + 10, stubY + 80, { width: this.stubWidth - 20, align: 'center' });
    }
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
      
      // Fond de la page
      doc.rect(0, 0, doc.page.width, doc.page.height)
         .fill('#f8f9fa');

      // Ajouter le ticket avec souche détachable au centre de la page
      const startX = (doc.page.width - this.totalWidth) / 2;
      const startY = (doc.page.height - this.ticketHeight) / 2;
      
      await this.drawEventTicketWithStub(doc, ticketData, eventData, userData, startX, startY);

      // Finaliser le PDF
      doc.end();

      return new Promise((resolve, reject) => {
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve({
            success: true,
            pdfBuffer,
            size: pdfBuffer.length,
            filename: `ticket-${ticketData.id}.pdf`
          });
        });
        doc.on('error', reject);
      });

    } catch (error) {
      logger.error('Failed to generate ticket PDF', {
        ticketId: ticketData.id,
        error: error.message,
        stack: error.stack
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
    // Arrière-plan décoratif
    doc.rect(0, 0, doc.page.width, doc.page.height)
       .fill('#f8f9fa');

    // En-tête avec dégradé simple
    const gradient = doc.linearGradient(0, 0, doc.page.width, this.defaultOptions.headerHeight);
    gradient.stop(0, '#667eea')
            .stop(1, '#764ba2');
    doc.rect(0, 0, doc.page.width, this.defaultOptions.headerHeight)
       .fill(gradient);

    // Titre de l'événement
    doc.fontSize(20) // Réduit de 24 à 20
       .font('Helvetica-Bold')
       .fillColor('#ffffff')
       .text('TICKET D\'EVENEMENT', 40, 25);
    
    doc.fontSize(14) // Réduit de 16 à 14
       .font('Helvetica-Bold')
       .fillColor('#ffffff')
       .text(eventData.title, 40, 50, { width: doc.page.width - 80 });
    
    // Ligne de séparation
    doc.moveTo(40, this.defaultOptions.headerHeight)
       .lineTo(doc.page.width - 40, this.defaultOptions.headerHeight)
       .lineWidth(2)
       .strokeColor('#e1e4e8')
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
    // Conteneur principal avec bordure
    const containerY = this.defaultOptions.headerHeight + 20;
    const containerHeight = 380;
    
    // Ombre portée
    doc.rect(42, containerY + 2, doc.page.width - 84, containerHeight)
       .fill('#00000010');
    
    // Conteneur blanc
    doc.rect(40, containerY, doc.page.width - 80, containerHeight)
       .fill('#ffffff')
       .lineWidth(2)
       .strokeColor('#e1e4e8')
       .stroke();

    // Section gauche - Informations
    const leftX = 60;
    const rightColumnWidth = 180;
    const leftWidth = (doc.page.width - 80) - rightColumnWidth;
    let currentY = containerY + 25;

    // Titre section ticket
    doc.fontSize(12) // Réduit de 16 à 12
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('INFORMATIONS DU TICKET', leftX, currentY, { width: leftWidth });
    
    currentY += 20;

    // Détails du ticket
    const ticketInfo = [
      { label: 'Numero ticket', value: `#${ticketData.id}` },
      { label: 'Type ticket', value: ticketData.type || 'Standard' },
      { label: 'Prix ticket', value: this.formatPrice(ticketData.price) },
      { label: 'Statut ticket', value: this.getTicketStatus(ticketData.status) }
    ];

    const writeField = (label, value) => {
      doc.fontSize(8) // Réduit de 10 à 8
         .font('Helvetica-Bold')
         .fillColor('#6b7280')
         .text(`${label}:`, leftX, currentY, { width: leftWidth });

      currentY += doc.heightOfString(`${label}:`, { width: leftWidth }) + 1;

      const safeValue = value ? String(value) : '-';
      doc.fontSize(9) // Réduit de 11 à 9
         .font('Helvetica')
         .fillColor('#1f2937')
         .text(safeValue, leftX, currentY, { width: leftWidth });

      currentY += doc.heightOfString(safeValue, { width: leftWidth }) + 6;
    };

    ticketInfo.forEach(info => writeField(info.label, info.value));
    
    currentY += 20;
    
    // Titre section participant
    doc.fontSize(12) // Réduit de 16 à 12
       .font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('INFORMATIONS DU PARTICIPANT', leftX, currentY, { width: leftWidth });
    
    currentY += 20;

    const participantInfo = [
      { label: 'Nom complet:', value: `${userData.first_name} ${userData.last_name}` },
      { label: 'Email:', value: userData.email },
      { label: 'Telephone:', value: userData.phone || 'Non specifie' }
    ];
    
    participantInfo.forEach(info => writeField(info.label, info.value));
    
    // Section droite - QR Code
    const qrX = doc.page.width - 60 - rightColumnWidth;
    const qrY = containerY + 25;

    // Générer et intégrer le QR code
    try {
      const qrResult = await qrCodeService.generateTicketQRCode({
        id: ticketData.id,
        eventId: eventData.id,
        userId: userData.id,
        type: ticketData.type,
        price: ticketData.price,
        createdAt: ticketData.createdAt
      });
      
      if (qrResult.success && qrResult.qrCodeBuffer) {
        // Fond pour le QR code
        doc.rect(qrX - 10, qrY - 10, 160, 190)
           .fill('#f8f9fa')
           .lineWidth(1)
           .strokeColor('#e1e4e8')
           .stroke();
        
        // Ajouter le QR code au PDF
        doc.image(qrResult.qrCodeBuffer, qrX, qrY, { 
          width: 140, // Réduit de 150 à 140
          height: 140 
        });
        
        // Texte sous le QR code
        doc.fontSize(9) // Réduit de 11 à 9
           .font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('Scannez pour', qrX + 10, qrY + 150, { width: 120, align: 'center' });
        
        doc.fontSize(9) // Réduit de 11 à 9
           .font('Helvetica-Bold')
           .fillColor('#667eea')
           .text('valider l\'entree', qrX + 10, qrY + 163, { width: 120, align: 'center' });
        
      } else {
        // Placeholder stylisé
        doc.rect(qrX - 10, qrY - 10, 160, 190)
           .fill('#f8f9fa')
           .lineWidth(1)
           .strokeColor('#e1e4e8')
           .stroke();
        
        doc.fontSize(10) // Réduit de 12 à 10
           .fillColor('#7f8c8d')
           .text('QR Code', qrX + 40, qrY + 70, { width: 50, align: 'center' });
        
        doc.fontSize(8) // Réduit de 10 à 8
           .fillColor('#7f8c8d')
           .text('temporairement', qrX + 40, qrY + 85, { width: 50, align: 'center' });
        
        doc.fontSize(8)
           .fillColor('#7f8c8d')
           .text('indisponible', qrX + 40, qrY + 98, { width: 50, align: 'center' });
      }
    } catch (qrError) {
      logger.warn('Failed to generate QR code for PDF', {
        ticketId: ticketData.id,
        error: qrError.message
      });
      
      // Placeholder en cas d'erreur
      doc.rect(qrX - 10, qrY - 10, 160, 190)
         .fill('#f8f9fa')
         .lineWidth(1)
         .strokeColor('#e1e4e8')
         .stroke();
      
      doc.fontSize(10)
         .fillColor('#7f8c8d')
         .text('QR Code', qrX + 40, qrY + 70, { width: 50, align: 'center' });
      
      doc.fontSize(8)
         .fillColor('#7f8c8d')
         .text('indisponible', qrX + 40, qrY + 85, { width: 50, align: 'center' });
    }
    
    // Instructions importantes
    const instructionsY = Math.max(currentY + 6, containerY + containerHeight - 70);
    doc.fontSize(10) // Réduit de 12 à 10
       .font('Helvetica-Bold')
       .fillColor('#e74c3c')
       .text('INSTRUCTIONS IMPORTANTES:', leftX, instructionsY, { width: leftWidth });
    
    const instructions = [
      '• Presentez ce ticket a l\'entree',
      '• Ce ticket est personnel et non transférable',
      '• Conservez ce ticket jusqu\'a la fin de l\'evenement',
      '• En cas de perte, contactez l\'organisateur'
    ];
    
    let instructionY = instructionsY + 15;
    instructions.forEach(instruction => {
      doc.fontSize(8) // Réduit de 10 à 8
         .font('Helvetica')
         .fillColor('#34495e')
         .text(instruction, leftX, instructionY);
      instructionY += 12;
    });
  }

  /**
   * Ajoute le pied de page du PDF
   * @param {PDFDocument} doc - Document PDF
   * @param {Object} ticketData - Données du ticket
   */
  async addFooter(doc, ticketData) {
    const footerY = doc.page.height - 40;
    
    // Ligne de séparation
    doc.moveTo(40, footerY)
       .lineTo(doc.page.width - 40, footerY)
       .lineWidth(1)
       .strokeColor('#e1e4e8')
       .stroke();
    
    // Informations du pied de page
    doc.fontSize(8) // Réduit de 10 à 8
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(`Ticket ID: ${ticketData.id} | Genere le: ${new Date().toLocaleString('fr-FR')}`, 40, footerY + 10);
    
    doc.fontSize(8) // Réduit de 10 à 8
       .font('Helvetica-Bold')
       .fillColor('#667eea')
       .text('Ce ticket est personnel et non transférable', 40, footerY + 20);
    
    // Numéro de page
    const pageNumber = doc.bufferedPageRange().start + 1;
    doc.fontSize(7) // Réduit de 9 à 7
       .font('Helvetica')
       .fillColor('#7f8c8d')
       .text(`Page ${pageNumber}`, doc.page.width - 60, footerY + 15);
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
    if (!date) return null;
    
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
