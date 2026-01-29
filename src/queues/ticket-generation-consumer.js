/**
 * Consommateur Redis pour le service de génération de billets
 * Ce service consomme les jobs de génération de billets depuis la queue Redis
 * et traite chaque ticket pour générer QR codes et fichiers PDF/images
 * 
 * Principes :
 * - Communication asynchrone via BullMQ
 * - Traitement par lots pour optimisation
 * - Gestion des erreurs avec retry automatique
 * - Stockage des fichiers générés (local/CDN)
 * - Émission des résultats vers event-planner-core
 */

const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { createQueue } = require('../../../shared/config/redis-config');

// Configuration
const TICKET_GENERATION_QUEUE = 'ticket_generation_queue';
const TICKET_GENERATION_RESULT_QUEUE = 'ticket_generation_result_queue';

// Configuration du stockage
const STORAGE_CONFIG = {
  local: {
    enabled: process.env.TICKET_STORAGE_LOCAL === 'true',
    basePath: process.env.TICKET_STORAGE_LOCAL_PATH || './generated-tickets'
  },
  cdn: {
    enabled: process.env.TICKET_STORAGE_CDN === 'true',
    baseUrl: process.env.TICKET_STORAGE_CDN_BASE_URL || 'https://cdn.event-planner.com/tickets'
  }
};

/**
 * Génère un QR code sécurisé pour un ticket
 * @param {Object} ticketData - Données du ticket
 * @returns {Promise<string>} Données du QR code encodées
 */
async function generateSecureQRCode(ticketData) {
  try {
    // Création du payload sécurisé pour le QR code
    const qrPayload = {
      ticket_id: ticketData.ticket_id,
      ticket_code: ticketData.ticket_code,
      event_id: ticketData.event_id,
      timestamp: Date.now(),
      checksum: generateChecksum(ticketData)
    };
    
    // Génération du QR code
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'H', // Haut niveau de correction d'erreur
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });
    
    console.log(`[QR_GENERATOR] QR code généré pour ticket ${ticketData.ticket_id}`);
    
    return qrDataUrl;
    
  } catch (error) {
    console.error(`[QR_GENERATOR] Erreur génération QR code ticket ${ticketData.ticket_id}:`, error.message);
    throw new Error(`Impossible de générer le QR code: ${error.message}`);
  }
}

/**
 * Génère un checksum pour l'intégrité des données
 * @param {Object} data - Données à checksummer
 * @returns {string} Checksum SHA256
 */
function generateChecksum(data) {
  const crypto = require('crypto');
  const dataString = JSON.stringify(data);
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Génère un fichier PDF pour un ticket
 * @param {Object} ticketData - Données du ticket
 * @param {string} qrCodeData - Données du QR code
 * @returns {Promise<Buffer>} Buffer du PDF généré
 */
async function generateTicketPDF(ticketData, qrCodeData) {
  return new Promise((resolve, reject) => {
    try {
      // Création du document PDF
      const doc = new PDFDocument({
        size: 'A6',
        margin: 20,
        info: {
          Title: `Ticket - ${ticketData.render_payload.event_title || 'Event'}`,
          Author: 'Event Planner',
          Subject: `Ticket ${ticketData.ticket_code}`,
          Creator: 'Event Planner Ticket Generator'
        }
      });
      
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // En-tête du ticket
      doc.fontSize(24).text('EVENT TICKET', { align: 'center' });
      doc.moveDown();
      
      // Informations de l'événement
      doc.fontSize(16).text(ticketData.render_payload.event_title || 'Event Title', { align: 'center' });
      doc.moveDown();
      
      // Date et lieu
      doc.fontSize(12).text(`Date: ${ticketData.render_payload.date || 'TBD'}`, { align: 'center' });
      if (ticketData.render_payload.venue) {
        doc.text(`Lieu: ${ticketData.render_payload.venue}`, { align: 'center' });
      }
      doc.moveDown();
      
      // Informations du participant
      doc.fontSize(14).text('Participant:', { underline: true });
      doc.fontSize(12).text(ticketData.render_payload.guest_name || 'Guest Name');
      doc.moveDown();
      
      // Code du ticket
      doc.fontSize(12).text(`Code: ${ticketData.ticket_code}`);
      doc.moveDown();
      
      // QR Code
      if (qrCodeData) {
        // Conversion du data URL en buffer
        const base64Data = qrCodeData.replace(/^data:image\/png;base64,/, '');
        const qrBuffer = Buffer.from(base64Data, 'base64');
        
        doc.text('QR Code:', { underline: true });
        doc.image(qrBuffer, { fit: [150, 150], align: 'center' });
      }
      
      // Pied de page
      doc.fontSize(8).text('Généré par Event Planner - Ce ticket est non transférable', { align: 'center' });
      
      // Finalisation du PDF
      doc.end();
      
    } catch (error) {
      reject(new Error(`Erreur génération PDF: ${error.message}`));
    }
  });
}

/**
 * Stocke un fichier généré (local ou CDN)
 * @param {Buffer} fileData - Données du fichier
 * @param {string} filename - Nom du fichier
 * @param {string} ticketId - ID du ticket
 * @returns {Promise<Object>} Informations de stockage
 */
async function storeGeneratedFile(fileData, filename, ticketId) {
  try {
    const timestamp = Date.now();
    const storedFilename = `ticket-${ticketId}-${timestamp}.pdf`;
    
    // Stockage local si configuré
    let localPath = null;
    if (STORAGE_CONFIG.local.enabled) {
      const fullPath = path.join(STORAGE_CONFIG.local.basePath, storedFilename);
      
      // Création du répertoire si nécessaire
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Écriture du fichier
      await fs.writeFile(fullPath, fileData);
      localPath = fullPath;
      
      console.log(`[STORAGE] Fichier stocké localement: ${fullPath}`);
    }
    
    // URL CDN si configuré
    let cdnUrl = null;
    if (STORAGE_CONFIG.cdn.enabled) {
      cdnUrl = `${STORAGE_CONFIG.cdn.baseUrl}/${storedFilename}`;
      console.log(`[STORAGE] URL CDN générée: ${cdnUrl}`);
    }
    
    return {
      filename: storedFilename,
      local_path: localPath,
      cdn_url: cdnUrl,
      file_url: cdnUrl || `file://${localPath}`,
      size_bytes: fileData.length,
      content_type: 'application/pdf',
      generated_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[STORAGE] Erreur stockage fichier:`, error.message);
    throw new Error(`Impossible de stocker le fichier: ${error.message}`);
  }
}

/**
 * Traite un ticket individuel
 * @param {Object} ticket - Données du ticket à traiter
 * @param {number} eventId - ID de l'événement
 * @returns {Promise<Object>} Résultat du traitement
 */
async function processTicket(ticket, eventId) {
  try {
    console.log(`[TICKET_PROCESSOR] Traitement ticket ${ticket.ticket_id} (${ticket.ticket_code})`);
    
    // Ajout de l'event_id aux données du ticket
    const ticketData = {
      ...ticket,
      event_id: eventId
    };
    
    // Génération du QR code
    const qrCodeData = await generateSecureQRCode(ticketData);
    
    // Génération du PDF
    const pdfBuffer = await generateTicketPDF(ticketData, qrCodeData);
    
    // Stockage du fichier
    const storageInfo = await storeGeneratedFile(pdfBuffer, `ticket-${ticket.ticket_id}.pdf`, ticket.ticket_id);
    
    console.log(`[TICKET_PROCESSOR] Ticket ${ticket.ticket_id} traité avec succès`);
    
    return {
      ticket_id: ticket.ticket_id,
      ticket_code: ticket.ticket_code,
      qr_code_data: qrCodeData,
      file_url: storageInfo.file_url,
      file_path: storageInfo.local_path,
      file_size: storageInfo.size_bytes,
      processed_at: new Date().toISOString(),
      status: 'success'
    };
    
  } catch (error) {
    console.error(`[TICKET_PROCESSOR] Erreur traitement ticket ${ticket.ticket_id}:`, error.message);
    
    return {
      ticket_id: ticket.ticket_id,
      ticket_code: ticket.ticket_code,
      error: error.message,
      processed_at: new Date().toISOString(),
      status: 'failed'
    };
  }
}

/**
 * Traite un job de génération de billets complet
 * @param {Object} job - Job BullMQ
 * @returns {Promise<Object>} Résultat du traitement
 */
async function processTicketGenerationJob(job) {
  const { data } = job;
  const startTime = Date.now();
  
  try {
    console.log(`[JOB_PROCESSOR] Début traitement job ${data.job_id} pour événement ${data.event_id}`);
    console.log(`[JOB_PROCESSOR] Nombre de tickets à traiter: ${data.tickets.length}`);
    
    // Traitement de tous les tickets
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (const ticket of data.tickets) {
      const result = await processTicket(ticket, data.event_id);
      results.push(result);
      
      if (result.status === 'success') {
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Détermination du statut global du job
    const jobStatus = failureCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed');
    
    console.log(`[JOB_PROCESSOR] Job ${data.job_id} terminé: ${jobStatus} (${successCount} succès, ${failureCount} échecs, ${processingTime}ms)`);
    
    // Préparation du message de retour
    const resultMessage = {
      job_id: data.job_id,
      status: jobStatus,
      event_id: data.event_id,
      processing_time_ms: processingTime,
      results: results,
      summary: {
        total_tickets: data.tickets.length,
        success_count: successCount,
        failure_count: failureCount,
        success_rate: Math.round((successCount / data.tickets.length) * 100)
      },
      processed_at: new Date().toISOString()
    };
    
    // Émission du résultat vers event-planner-core
    await emitGenerationResult(resultMessage);
    
    return resultMessage;
    
  } catch (error) {
    console.error(`[JOB_PROCESSOR] Erreur critique traitement job ${data.job_id}:`, error.message);
    
    const errorMessage = {
      job_id: data.job_id,
      status: 'failed',
      event_id: data.event_id,
      error: error.message,
      processed_at: new Date().toISOString()
    };
    
    // Émission de l'erreur vers event-planner-core
    await emitGenerationResult(errorMessage);
    
    throw error;
  }
}

/**
 * Émet le résultat de génération vers event-planner-core
 * @param {Object} result - Résultat à émettre
 * @returns {Promise<void>}
 */
async function emitGenerationResult(result) {
  try {
    const resultQueue = createQueue(TICKET_GENERATION_RESULT_QUEUE);
    
    await resultQueue.add('generation-result', result, {
      priority: 1,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    
    console.log(`[EMITTER] Résultat émis pour job ${result.job_id}: ${result.status}`);
    
  } catch (error) {
    console.error(`[EMITTER] Erreur émission résultat job ${result.job_id}:`, error.message);
    // Ne pas throw l'erreur pour ne pas bloquer le traitement
  }
}

/**
 * Démarre le consommateur de tickets
 */
function startTicketGenerationConsumer() {
  const queue = createQueue(TICKET_GENERATION_QUEUE);
  
  console.log('[TICKET_CONSUMER] Démarrage consommateur de génération de billets');
  
  // Configuration du processeur
  queue.process('generate-tickets', 3, processTicketGenerationJob); // 3 concurrent workers
  
  // Gestion des événements de la queue
  queue.on('error', (error) => {
    console.error('[TICKET_CONSUMER] Erreur queue:', error.message);
  });
  
  queue.on('waiting', (jobId) => {
    console.log(`[TICKET_CONSUMER] Job ${jobId} en attente`);
  });
  
  queue.on('active', (job) => {
    console.log(`[TICKET_CONSUMER] Job ${job.id} actif`);
  });
  
  queue.on('completed', (job) => {
    console.log(`[TICKET_CONSUMER] Job ${job.id} complété`);
  });
  
  queue.on('failed', (job, error) => {
    console.error(`[TICKET_CONSUMER] Job ${job.id} échoué:`, error.message);
  });
  
  queue.on('stalled', (job) => {
    console.warn(`[TICKET_CONSUMER] Job ${job.id} stalled`);
  });
  
  console.log('[TICKET_CONSUMER] Consommateur démarré avec succès');
}

module.exports = {
  startTicketGenerationConsumer,
  processTicketGenerationJob,
  generateSecureQRCode,
  generateTicketPDF,
  storeGeneratedFile,
  TICKET_GENERATION_QUEUE,
  TICKET_GENERATION_RESULT_QUEUE
};
