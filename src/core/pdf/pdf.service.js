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

    // Palette unifiée pour tous les PDFs générés par le service
    this.theme = {
      page: '#F6F7F9',
      surface: '#FFFFFF',
      primary: '#1F2937',
      accent: '#0EA5A4',
      text: '#1F2937',
      muted: '#6B7280',
      label: '#94A3B8',
      border: '#E5E7EB',
      borderLight: '#EEF2F7',
      stub: '#F1F5F9',
      danger: '#DC2626'
    };

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
    const cardRadius = 10;
    const cardX = startX;
    const cardY = startY;
    const cardW = this.totalWidth;
    const cardH = this.ticketHeight;

    // Ombre douce
    doc.save();
    doc.fillColor('#000000', 0.08)
       .roundedRect(cardX + 2, cardY + 3, cardW, cardH, cardRadius)
       .fill();
    doc.restore();

    // Carte principale
    doc.roundedRect(cardX, cardY, cardW, cardH, cardRadius)
       .lineWidth(1)
       .strokeColor(this.theme.border)
       .fillAndStroke(this.theme.surface, this.theme.border);

    // === TICKET PRINCIPAL (gauche) ===
    const ticketX = startX;
    const ticketY = startY;
    
    // Ligne de séparation verticale (entre ticket et souche)
    doc.save();
    doc.moveTo(ticketX + this.ticketWidth, ticketY + 10)
       .lineTo(ticketX + this.ticketWidth, ticketY + this.ticketHeight - 10)
       .lineWidth(1)
       .strokeColor(this.theme.borderLight)
       .stroke();
    doc.restore();

    // Bandeau titre
    doc.save();
    doc.roundedRect(ticketX + 12, ticketY + 12, this.ticketWidth - 24, 34, 8)
       .fill(this.theme.primary);
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(this.theme.surface)
       .text((eventData.title || 'Événement').toUpperCase(), ticketX + 18, ticketY + 22, {
         width: this.ticketWidth - 36,
         ellipsis: true
       });
    doc.restore();

    // Numéro + type
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor(this.theme.accent)
       .text(`TICKET #${ticketData.id}`, ticketX + 18, ticketY + 54);

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(this.theme.muted)
       .text(ticketData.type || 'Standard', ticketX + 18, ticketY + 68);

    // Détails événement
    const eventDate = this.formatDate(eventData.event_date);
    const detailX = ticketX + 18;
    let detailY = ticketY + 90;
    const labelStyle = () => doc.fontSize(8).font('Helvetica-Bold').fillColor(this.theme.label);
    const valueStyle = () => doc.fontSize(10).font('Helvetica').fillColor(this.theme.text);

    labelStyle().text('DATE', detailX, detailY);
    valueStyle().text(eventDate || 'Date à confirmer', detailX, detailY + 12, { width: this.ticketWidth - 36 });
    detailY += 32;

    labelStyle().text('LIEU', detailX, detailY);
    valueStyle().text(eventData.location || 'Non spécifié', detailX, detailY + 12, { width: this.ticketWidth - 36 });
    detailY += 32;

    labelStyle().text('PARTICIPANT', detailX, detailY);
    valueStyle().text(`${userData.first_name} ${userData.last_name}`, detailX, detailY + 12, {
      width: this.ticketWidth - 36
    });

    // Prix en bas à droite
    const priceText = this.formatPrice(ticketData.price);
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor(this.theme.text)
       .text(priceText, ticketX + this.ticketWidth - 120, ticketY + this.ticketHeight - 28, {
         width: 100,
         align: 'right'
       });

    // === SOUCHE DÉTACHABLE (droite) ===
    const stubX = ticketX + this.ticketWidth;
    const stubY = ticketY;
    
    // Fond de la souche
    doc.save();
    doc.roundedRect(stubX + 6, stubY + 6, this.stubWidth - 12, this.ticketHeight - 12, 8)
       .fill(this.theme.stub)
       .lineWidth(1)
       .strokeColor(this.theme.border)
       .stroke();
    doc.restore();

    // Ligne de perforation
    doc.save();
    doc.moveTo(stubX, stubY + 24)
       .lineTo(stubX, stubY + this.ticketHeight - 24)
       .lineWidth(1)
       .strokeColor(this.theme.border)
       .dash(2, 4)
       .stroke();
    doc.undash();
    doc.restore();

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
        const qrSize = 76;
        const qrXPos = stubX + (this.stubWidth - qrSize) / 2;
        const qrYPos = stubY + 42;

        // Cadre QR
        doc.roundedRect(qrXPos - 6, qrYPos - 6, qrSize + 12, qrSize + 12, 6)
           .fill(this.theme.surface)
           .lineWidth(1)
           .strokeColor(this.theme.border)
           .stroke();

        doc.image(qrResult.qrCodeBuffer, qrXPos, qrYPos, { width: qrSize, height: qrSize });

        // Numéro sous QR code
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor(this.theme.primary)
           .text(`#${ticketData.id}`, stubX + 10, stubY + 132, {
             width: this.stubWidth - 20,
             align: 'center'
           });

        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(this.theme.muted)
           .text('Scan pour valider', stubX + 10, stubY + 146, {
             width: this.stubWidth - 20,
             align: 'center'
           });
        
      } else {
        // Placeholder simple
        doc.fontSize(8)
           .fillColor(this.theme.label)
           .text('QR Code', stubX + 10, stubY + 86, { width: this.stubWidth - 20, align: 'center' });
      }
    } catch (qrError) {
      // Placeholder erreur
      doc.fontSize(8)
         .fillColor(this.theme.label)
         .text('QR indisponible', stubX + 10, stubY + 86, { width: this.stubWidth - 20, align: 'center' });
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
         .fill(this.theme.page);

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
       .fill(this.theme.page);

    // En-tête avec dégradé simple
    const gradient = doc.linearGradient(0, 0, doc.page.width, this.defaultOptions.headerHeight);
    gradient.stop(0, this.theme.primary)
            .stop(1, this.theme.accent);
    doc.rect(0, 0, doc.page.width, this.defaultOptions.headerHeight)
       .fill(gradient);

    // Titre de l'événement
    doc.fontSize(20) // Réduit de 24 à 20
       .font('Helvetica-Bold')
       .fillColor(this.theme.surface)
       .text('TICKET D\'EVENEMENT', 40, 25);
    
    doc.fontSize(14) // Réduit de 16 à 14
       .font('Helvetica-Bold')
       .fillColor(this.theme.surface)
       .text(eventData.title, 40, 50, { width: doc.page.width - 80 });
    
    // Ligne de séparation
    doc.moveTo(40, this.defaultOptions.headerHeight)
       .lineTo(doc.page.width - 40, this.defaultOptions.headerHeight)
       .lineWidth(2)
       .strokeColor(this.theme.border)
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
       .fill(this.theme.surface)
       .lineWidth(2)
       .strokeColor(this.theme.border)
       .stroke();

    // Section gauche - Informations
    const leftX = 60;
    const rightColumnWidth = 180;
    const leftWidth = (doc.page.width - 80) - rightColumnWidth;
    let currentY = containerY + 25;

    // Titre section ticket
    doc.fontSize(12) // Réduit de 16 à 12
       .font('Helvetica-Bold')
       .fillColor(this.theme.text)
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
         .fillColor(this.theme.muted)
         .text(`${label}:`, leftX, currentY, { width: leftWidth });

      currentY += doc.heightOfString(`${label}:`, { width: leftWidth }) + 1;

      const safeValue = value ? String(value) : '-';
      doc.fontSize(9) // Réduit de 11 à 9
         .font('Helvetica')
         .fillColor(this.theme.text)
         .text(safeValue, leftX, currentY, { width: leftWidth });

      currentY += doc.heightOfString(safeValue, { width: leftWidth }) + 6;
    };

    ticketInfo.forEach(info => writeField(info.label, info.value));
    
    currentY += 20;
    
    // Titre section participant
    doc.fontSize(12) // Réduit de 16 à 12
       .font('Helvetica-Bold')
       .fillColor(this.theme.text)
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
           .fill(this.theme.page)
           .lineWidth(1)
           .strokeColor(this.theme.border)
           .stroke();
        
        // Ajouter le QR code au PDF
        doc.image(qrResult.qrCodeBuffer, qrX, qrY, { 
          width: 140, // Réduit de 150 à 140
          height: 140 
        });
        
        // Texte sous le QR code
        doc.fontSize(9) // Réduit de 11 à 9
           .font('Helvetica-Bold')
           .fillColor(this.theme.text)
           .text('Scannez pour', qrX + 10, qrY + 150, { width: 120, align: 'center' });
        
        doc.fontSize(9) // Réduit de 11 à 9
           .font('Helvetica-Bold')
           .fillColor(this.theme.accent)
           .text('valider l\'entree', qrX + 10, qrY + 163, { width: 120, align: 'center' });
        
      } else {
        // Placeholder stylisé
        doc.rect(qrX - 10, qrY - 10, 160, 190)
           .fill(this.theme.page)
           .lineWidth(1)
           .strokeColor(this.theme.border)
           .stroke();
        
        doc.fontSize(10) // Réduit de 12 à 10
           .fillColor(this.theme.muted)
           .text('QR Code', qrX + 40, qrY + 70, { width: 50, align: 'center' });
        
        doc.fontSize(8) // Réduit de 10 à 8
           .fillColor(this.theme.muted)
           .text('temporairement', qrX + 40, qrY + 85, { width: 50, align: 'center' });
        
        doc.fontSize(8)
           .fillColor(this.theme.muted)
           .text('indisponible', qrX + 40, qrY + 98, { width: 50, align: 'center' });
      }
    } catch (qrError) {
      logger.warn('Failed to generate QR code for PDF', {
        ticketId: ticketData.id,
        error: qrError.message
      });
      
      // Placeholder en cas d'erreur
      doc.rect(qrX - 10, qrY - 10, 160, 190)
         .fill(this.theme.page)
         .lineWidth(1)
         .strokeColor(this.theme.border)
         .stroke();
      
      doc.fontSize(10)
         .fillColor(this.theme.muted)
         .text('QR Code', qrX + 40, qrY + 70, { width: 50, align: 'center' });
      
      doc.fontSize(8)
         .fillColor(this.theme.muted)
         .text('indisponible', qrX + 40, qrY + 85, { width: 50, align: 'center' });
    }
    
    // Instructions importantes
    const instructionsY = Math.max(currentY + 6, containerY + containerHeight - 70);
    doc.fontSize(10) // Réduit de 12 à 10
       .font('Helvetica-Bold')
       .fillColor(this.theme.danger)
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
         .fillColor(this.theme.text)
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
       .strokeColor(this.theme.border)
       .stroke();
    
    // Informations du pied de page
    doc.fontSize(8) // Réduit de 10 à 8
       .font('Helvetica')
       .fillColor(this.theme.muted)
       .text(`Ticket ID: ${ticketData.id} | Genere le: ${new Date().toLocaleString('fr-FR')}`, 40, footerY + 10);
    
    doc.fontSize(8) // Réduit de 10 à 8
       .font('Helvetica-Bold')
       .fillColor(this.theme.accent)
       .text('Ce ticket est personnel et non transférable', 40, footerY + 20);
    
    // Numéro de page
    const pageNumber = doc.bufferedPageRange().start + 1;
    doc.fontSize(7) // Réduit de 9 à 7
       .font('Helvetica')
       .fillColor(this.theme.muted)
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

      for (let index = 0; index < tickets.length; index += 1) {
        const ticket = tickets[index];
        if (index > 0) {
          doc.addPage();
        }

        // Fond de page unifié
        doc.rect(0, 0, doc.page.width, doc.page.height)
           .fill(this.theme.page);

        const mappedTicket = {
          id: ticket.id || ticket.ticket_id,
          type: ticket.type || ticket.ticket_type?.name || 'Standard',
          price: ticket.price ?? ticket.ticket_type?.price ?? 0,
          status: ticket.status || 'active',
          createdAt: ticket.created_at || ticket.createdAt || new Date().toISOString()
        };

        const guest = ticket.guest || ticket.user || {};
        const fallbackName = guest.name || '';
        const [firstName = guest.first_name || ''] = fallbackName.split(' ');
        const lastName = guest.last_name || fallbackName.split(' ').slice(1).join(' ') || '';

        const mappedUser = {
          id: guest.id || ticket.user_id,
          first_name: guest.first_name || firstName || 'Participant',
          last_name: guest.last_name || lastName || '',
          email: guest.email || '',
          phone: guest.phone || ''
        };

        const mappedEvent = {
          id: eventData?.id || ticket.event_id,
          title: eventData?.title || ticket.event?.title || 'Événement',
          event_date: eventData?.event_date || eventData?.date || ticket.event?.date || null,
          location: eventData?.location || ticket.event?.location || 'Non spécifié'
        };

        const startX = (doc.page.width - this.totalWidth) / 2;
        const startY = (doc.page.height - this.ticketHeight) / 2;

        await this.drawEventTicketWithStub(doc, mappedTicket, mappedEvent, mappedUser, startX, startY);
      }

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
