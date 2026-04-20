/**
 * Service de génération de tickets pour Ticket-Generator
 * Structure optimisée pour recevoir les données enrichies de event-planner-core
 */

const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const { database } = require('../config/database');
const notificationClient = require('../../../shared/clients/notification-client');
const htmlTemplateService = require('../core/templates/html-template.service');

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
      const logResult = await this.saveGenerationLog(ticket_id, ticketData, qrCodeData, pdfFile);
      
      // Générer un ticket_code unique pour la réponse
      const uniqueTicketCode = `${ticket_code}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        ticket_id,
        ticket_code: uniqueTicketCode, // Retourner le ticket_code unique
        original_ticket_code: ticket_code, // Garder l'original pour référence
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
      const { ticket_id, ticket_code } = ticketData;

      const filename = `ticket_${ticket_code}_${Date.now()}.pdf`;
      const filepath = path.join(this.outputDir, filename);

      const pdfBuffer = await this.generatePDFContent(ticketData, options);
      await fs.writeFile(filepath, pdfBuffer);

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
  async generatePDFContent(ticketData) {
    const { ticket_id, ticket_code, guest, ticket_type, event, status, created_at } = ticketData;

    const fallbackName = guest?.name || '';
    const [firstName = guest?.first_name || ''] = fallbackName.split(' ');
    const lastName = guest?.last_name || fallbackName.split(' ').slice(1).join(' ') || '';

    const mappedTicket = {
      id: ticket_id || ticketData.id,
      type: ticket_type?.name || ticketData.type || 'Standard',
      price: ticket_type?.price ?? ticketData.price ?? 0,
      status: status || ticketData.status || 'active',
      createdAt: created_at || ticketData.createdAt || new Date().toISOString()
    };

    const mappedEvent = {
      id: event?.id || ticketData.event_id,
      title: event?.title || 'Événement',
      event_date: event?.date || event?.event_date || null,
      location: event?.location || 'Non spécifié',
      description: event?.description || '',
      category: event?.category || '',
      organizer_name: event?.organizer_name || ticketData.event?.organizer_name || ''
    };

    const mappedUser = {
      id: guest?.id || ticketData.user_id,
      first_name: guest?.first_name || firstName || 'Participant',
      last_name: guest?.last_name || lastName || '',
      email: guest?.email || '',
      phone: guest?.phone || ''
    };

    const templatePath = ticketData.template?.source_files_path || null;
    const qrPayload = ticketData.qr_code_data || ticketData.qrCodeData || ticket_code || String(ticket_id);
    const qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 1, width: 300 });
    const qrCodeDataUrl = `data:image/png;base64,${qrBuffer.toString('base64')}`;
    const variables = this.buildTemplateVariables({
      ticketData,
      mappedTicket,
      mappedEvent,
      mappedUser,
      qrCodePath: null,
      qrCodeDataUrl
    });

    if (templatePath) {
      // Un template configuré doit rester la source de vérité du rendu PDF.
      try {
        const { workingDir, indexPath, svgPath, previewPath } = await htmlTemplateService.prepareTemplate(templatePath);
        try {
          const html = indexPath ? await htmlTemplateService.loadTemplateContent(indexPath) : null;

          // Générer un QR code PNG (valeur identique à celle stockée en base)
          // On injecte un data URL PNG pour éviter les blocages d'accès aux fichiers locaux dans Chromium.
          let width = null;
          let height = null;
          if (previewPath) {
            try {
              const previewMetadata = await require('sharp')(previewPath).metadata();
              width = previewMetadata.width || null;
              height = previewMetadata.height || null;
            } catch (metaError) {
              console.warn('[TICKET_GENERATION] Preview metadata error:', metaError.message);
            }
          }

          if (svgPath) {
            const svgTemplate = await fs.readFile(svgPath, 'utf8');
            const renderedSvg = this.replaceTemplateVariables(svgTemplate, variables);
            return await htmlTemplateService.renderSvgToPdf(renderedSvg, { width, height });
          }

          if (!html) {
            throw new Error('index.html manquant dans le template');
          }

          const renderedHtml = this.replaceTemplateVariables(html, variables);
          const pdfBuffer = await htmlTemplateService.renderTemplateToPdf(renderedHtml, { width, height });
          return pdfBuffer;
        } finally {
          await fs.rm(workingDir, { recursive: true, force: true });
        }
      } catch (templateError) {
        throw new Error(`Configured ticket template rendering failed: ${templateError.message}`);
      }
    }

    try {
      const builderDefaultSvg = this.replaceTemplateVariables(this.buildDefaultBuilderTemplate(), variables);
      return await htmlTemplateService.renderSvgToPdf(builderDefaultSvg);
    } catch (builderFallbackError) {
      console.warn('[TICKET_GENERATION] Builder default PDF rendering failed:', builderFallbackError.message);
      throw new Error(`Builder-backed ticket PDF rendering failed: ${builderFallbackError.message}`);
    }
  }

  buildTemplateVariables({ ticketData, mappedTicket, mappedEvent, mappedUser, qrCodePath, qrCodeDataUrl }) {
    const eventDate = mappedEvent.event_date ? new Date(mappedEvent.event_date) : null;
    const eventDateLabel = eventDate ? eventDate.toISOString().split('T')[0] : '';
    const eventTimeLabel = eventDate ? eventDate.toISOString().split('T')[1]?.slice(0, 5) : '';
    const eventDateLong = eventDate
      ? eventDate.toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC'
        })
      : '';
    const eventTimeRichLabel = eventTimeLabel;
    const guestFirstName = mappedUser.first_name || '';
    const guestLastName = mappedUser.last_name || '';
    const guestDisplayName = [guestFirstName, guestLastName].filter(Boolean).join(' ').trim()
      || ticketData.guest?.name
      || mappedUser.email
      || mappedUser.phone
      || 'Guest';
    const guestInitials = [guestFirstName, guestLastName]
      .filter(Boolean)
      .map((chunk) => chunk.trim().charAt(0).toUpperCase())
      .join('')
      || guestDisplayName.trim().charAt(0).toUpperCase();
    const issuedAt = ticketData.issued_at || mappedTicket.createdAt || new Date().toISOString();
    const issuedDate = new Date(issuedAt);
    const invitationCode = ticketData.event_guest?.invitation_code || ticketData.ticket_code || String(mappedTicket.id || '');
    const organizerName = mappedEvent.organizer_name || ticketData.event?.organizer_name || '';
    const qrCodeUrl = qrCodeDataUrl || (qrCodePath ? `file://${qrCodePath}` : '');

    return {
      EVENT_TITLE: mappedEvent.title || '',
      EVENT_TITLE_UPPER: (mappedEvent.title || '').toUpperCase(),
      EVENT_TYPE: ticketData.ticket_type?.name || mappedTicket.type || '',
      EVENT_DATE: eventDateLabel,
      EVENT_DATE_LONG: eventDateLong,
      EVENT_TIME: eventTimeLabel,
      EVENT_TIME_LABEL: eventTimeRichLabel,
      EVENT_LOCATION: mappedEvent.location || '',
      EVENT_DESCRIPTION: mappedEvent.description || '',
      EVENT_CATEGORY: mappedEvent.category || '',
      GUEST_NAME: guestDisplayName,
      GUEST_DISPLAY_NAME: guestDisplayName,
      GUEST_FIRST_NAME: guestFirstName,
      GUEST_LAST_NAME: guestLastName,
      GUEST_EMAIL: mappedUser.email || '',
      GUEST_PHONE: mappedUser.phone || '',
      GUEST_INITIALS: guestInitials,
      TICKET_CODE: ticketData.ticket_code || String(mappedTicket.id || ''),
      TICKET_ID: String(mappedTicket.id || ''),
      TICKET_TYPE: ticketData.ticket_type?.name || mappedTicket.type || '',
      INVITATION_CODE: invitationCode,
      EVENT_GUEST_STATUS: ticketData.event_guest?.status || '',
      CHECK_IN_STATUS: ticketData.event_guest?.is_present ? 'Checked in' : 'Awaiting check-in',
      QR_CODE: qrCodeUrl,
      ORGANIZER_NAME: organizerName,
      ORGANIZER_LABEL: organizerName ? `Hosted by ${organizerName}` : '',
      FOOTER_LABEL: organizerName ? `Hosted by ${organizerName}` : 'Event Ticket',
      ISSUED_AT: issuedAt,
      ISSUED_DATE: Number.isNaN(issuedDate.getTime()) ? '' : issuedDate.toISOString().split('T')[0],
      ISSUED_TIME: Number.isNaN(issuedDate.getTime()) ? '' : issuedDate.toISOString().split('T')[1]?.slice(0, 5)
    };
  }

  replaceTemplateVariables(html, variables) {
    let output = html;

    // Gérer le QR code de façon robuste:
    // - Si le template l'utilise déjà en src (ex: <img src="{{QR_CODE}}">), on injecte l'URL.
    // - Si utilisé dans du CSS (url(...)), on injecte l'URL.
    // - Sinon on remplace le placeholder par une balise <img> pour éviter un rendu texte brut.
    if (variables.QR_CODE) {
      const qrUrl = variables.QR_CODE;
      const qrSrcRegex = /src=(["'])\s*\{\{\s*QR_CODE\s*\}\}\s*\1/g;
      output = output.replace(qrSrcRegex, `src="${qrUrl}"`);

      const qrHrefRegex = /href=(["'])\s*\{\{\s*QR_CODE\s*\}\}\s*\1/g;
      output = output.replace(qrHrefRegex, `href="${qrUrl}"`);

      const qrCssUrlRegex = /url\(\s*(["'])?\s*\{\{\s*QR_CODE\s*\}\}\s*(\1)?\s*\)/g;
      output = output.replace(qrCssUrlRegex, `url("${qrUrl}")`);

      const qrTokenRegex = /\{\{\s*QR_CODE\s*\}\}/g;
      output = output.replace(
        qrTokenRegex,
        `<img src="${qrUrl}" alt="QR Code" style="width:200px;height:200px;object-fit:contain;" />`
      );
    }

    Object.entries(variables).forEach(([key, value]) => {
      if (key === 'QR_CODE') return;
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      output = output.replace(regex, value ?? '');
    });

    return output;
  }

  buildDefaultBuilderTemplate() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="760" height="420" viewBox="0 0 760 420">
        <defs>
          <clipPath id="ticket-clip">
            <rect x="0" y="0" width="760" height="420" rx="28" />
          </clipPath>
        </defs>
        <g clip-path="url(#ticket-clip)">
          <rect width="760" height="420" fill="#08131D" />
          <rect x="42" y="34" width="110" height="36" rx="10" fill="#39C98B" />
          <text x="97" y="57" text-anchor="middle" fill="#08131D" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="800">TICKET</text>
          <text x="42" y="140" fill="#FFFFFF" font-family="Nunito, Arial, sans-serif" font-size="42" font-weight="800">{{EVENT_TITLE}}</text>
          <rect x="42" y="158" width="72" height="6" rx="999" fill="#39C98B" />
          <text x="42" y="198" fill="rgba(255,255,255,0.68)" font-family="Nunito, Arial, sans-serif" font-size="12" font-weight="700">DATE &amp; TIME</text>
          <text x="42" y="228" fill="#FFFFFF" font-family="Nunito, Arial, sans-serif" font-size="22" font-weight="700">{{EVENT_DATE}} • {{EVENT_TIME}}</text>
          <text x="328" y="198" fill="rgba(255,255,255,0.68)" font-family="Nunito, Arial, sans-serif" font-size="12" font-weight="700">VENUE</text>
          <text x="328" y="228" fill="#FFFFFF" font-family="Nunito, Arial, sans-serif" font-size="22" font-weight="700">{{EVENT_LOCATION}}</text>
          <line x1="24" y1="253" x2="736" y2="253" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="10 8" opacity="0.34" />
          <text x="42" y="300" fill="rgba(255,255,255,0.68)" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="700">GUEST</text>
          <text x="42" y="338" fill="#FFFFFF" font-family="Nunito, Arial, sans-serif" font-size="30" font-weight="800">{{GUEST_NAME}}</text>
          <rect x="42" y="344" width="220" height="36" rx="10" fill="#39C98B" />
          <text x="152" y="367" text-anchor="middle" fill="#08131D" font-family="Nunito, Arial, sans-serif" font-size="15" font-weight="800">{{EVENT_TYPE}}</text>
          <text x="42" y="406" fill="rgba(255,255,255,0.68)" font-family="'Roboto Mono', monospace" font-size="14" font-weight="700">{{TICKET_CODE}}</text>
          <rect x="602" y="284" width="120" height="120" rx="18" fill="rgba(255,255,255,0.95)" />
          <image href="{{QR_CODE}}" x="616" y="298" width="92" height="92" preserveAspectRatio="xMidYMid meet" />
          <text x="712" y="406" text-anchor="end" fill="rgba(255,255,255,0.68)" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="700">{{FOOTER_LABEL}}</text>
        </g>
      </svg>
    `;
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
      const { ticket_code: originalTicketCode, guest, ticket_type, template, event } = ticketData;
      
      // Générer un ticket_code unique pour éviter les doublons
      const uniqueTicketCode = `${originalTicketCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 1. Enregistrer dans ticket_generation_logs
      const logQuery = `
        INSERT INTO ticket_generation_logs (job_id, status, message, details, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id
      `;
      
      const logDetails = {
        ticket_id: ticketId,
        original_ticket_code: originalTicketCode,
        unique_ticket_code: uniqueTicketCode,
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
        `Ticket ${uniqueTicketCode} généré avec succès`,
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
        uniqueTicketCode, // ticket_code unique
        qrCodeData,
        template?.id || null,
        guest?.id || null,
        event?.id || null,
        pdfFile?.path || null
      ]);
      
      console.log(`[TICKET_GENERATION] Ticket généré enregistré: ${uniqueTicketCode} (generated_ticket_id: ${ticketResult.rows[0].id})`);
      
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

  /**
   * Envoie une notification de génération de ticket terminée
   * @param {Object} jobData - Données du job de génération
   * @param {Array} tickets - Tickets générés
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTicketGenerationNotification(jobData, tickets) {
    try {
      // Récupérer les informations de l'événement et de l'utilisateur
      const eventData = jobData.eventData || {};
      const userData = jobData.userData || {};

      // Préparer les données pour la notification
      const notificationData = {
        eventName: eventData.title || 'Événement',
        eventDate: eventData.event_date,
        eventLocation: eventData.location,
        ticketCount: tickets.length,
        ticketIds: tickets.map(t => t.id),
        downloadUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/download`,
        jobId: jobData.id
      };

      // Envoyer la notification à l'utilisateur
      if (userData.email) {
        const result = await notificationClient.sendTicketEmail(userData.email, notificationData);

        if (!result.success) {
          console.error('[TICKET_GENERATION] Failed to send ticket notification:', result.error);
        }

        return result;
      } else {
        console.warn('[TICKET_GENERATION] No user email found for ticket notification');
        return { success: false, error: 'No user email found' };
      }
    } catch (error) {
      console.error('[TICKET_GENERATION] Error sending ticket generation notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envoie une notification d'erreur de génération de ticket
   * @param {Object} jobData - Données du job de génération
   * @param {string} error - Erreur survenue
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTicketGenerationErrorNotification(jobData, error) {
    try {
      const userData = jobData.userData || {};
      const eventData = jobData.eventData || {};

      if (userData.email) {
        const result = await notificationClient.sendEmail({
          to: userData.email,
          template: 'ticket-generation-error',
          subject: 'Problème lors de la génération de vos tickets',
          data: {
            eventName: eventData.title || 'Événement',
            jobId: jobData.id,
            error: error,
            supportEmail: 'support@eventplanner.com',
            retryUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/retry/${jobData.id}`
          },
          priority: 'high'
        });

        if (!result.success) {
          console.error('[TICKET_GENERATION] Failed to send error notification:', result.error);
        }

        return result;
      } else {
        console.warn('[TICKET_GENERATION] No user email found for error notification');
        return { success: false, error: 'No user email found' };
      }
    } catch (error) {
      console.error('[TICKET_GENERATION] Error sending ticket generation error notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envoie une notification de génération batch terminée
   * @param {Object} jobData - Données du job batch
   * @param {Object} batchResult - Résultat du batch
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendBatchGenerationNotification(jobData, batchResult) {
    try {
      const userData = jobData.userData || {};
      const eventData = jobData.eventData || {};

      if (userData.email) {
        const result = await notificationClient.sendEmail({
          to: userData.email,
          template: 'batch-generation-complete',
          subject: 'Génération de tickets en lot terminée',
          data: {
            eventName: eventData.title || 'Événement',
            totalTickets: batchResult.totalTickets,
            successfulTickets: batchResult.successfulTickets,
            failedTickets: batchResult.failedTickets,
            jobId: jobData.id,
            downloadUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/batch/${jobData.id}/download`
          },
          priority: 'normal'
        });

        if (!result.success) {
          console.error('[TICKET_GENERATION] Failed to send batch notification:', result.error);
        }

        return result;
      } else {
        console.warn('[TICKET_GENERATION] No user email found for batch notification');
        return { success: false, error: 'No user email found' };
      }
    } catch (error) {
      console.error('[TICKET_GENERATION] Error sending batch generation notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TicketGenerationService();
