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
const pdfService = require('../core/pdf/pdf.service');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const ticketQueueService = require('../core/queue/ticket-queue.service');
const ticketWebhookService = require('../core/webhooks/ticket-webhook.service');
const ticketGenerationService = require('../services/ticket-generation.service');

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
async function generateTicketPDF(ticketData) {
  const guestName = ticketData?.guest?.name || 'Participant';
  const [firstName, ...lastParts] = guestName.split(' ');

  const mappedTicket = {
    id: ticketData.ticket_id,
    type: ticketData.ticket_type?.name || ticketData.type || 'Standard',
    price: ticketData.price || null,
    createdAt: ticketData.created_at || new Date().toISOString()
  };

  const mappedEvent = {
    id: ticketData.event?.id || ticketData.event_id,
    title: ticketData.event?.title || ticketData.render_payload?.event_title || 'Événement',
    location: ticketData.event?.location || ticketData.render_payload?.venue || 'Non spécifié',
    event_date: ticketData.event?.date || ticketData.event?.event_date || new Date().toISOString()
  };

  const mappedUser = {
    id: ticketData.guest?.id || ticketData.guest_id || null,
    first_name: firstName || 'Participant',
    last_name: lastParts.join(' ') || '',
    email: ticketData.guest?.email || ticketData.render_payload?.guest_email || null,
    phone: ticketData.guest?.phone || ticketData.render_payload?.guest_phone || null
  };

  const pdfResult = await pdfService.generateTicketPDF(mappedTicket, mappedEvent, mappedUser);

  if (!pdfResult.success) {
    throw new Error(pdfResult.error || 'PDF generation failed');
  }

  return pdfResult.pdfBuffer;
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
    const pdfBuffer = await generateTicketPDF(ticketData);
    
    // Stockage du fichier
    const storageInfo = await storeGeneratedFile(pdfBuffer, `ticket-${ticket.ticket_id}.pdf`, ticket.ticket_id);
    
    console.log(`[TICKET_PROCESSOR] Ticket ${ticket.ticket_id} traité avec succès`);

    // Persister en base locale (logs + generated_tickets)
    try {
      await ticketGenerationService.saveGenerationLog(ticket.ticket_id, ticketData, qrCodeData, {
        path: storageInfo.local_path,
        url: storageInfo.file_url,
        size_bytes: storageInfo.size_bytes
      });
    } catch (logError) {
      console.warn(`[TICKET_PROCESSOR] Échec enregistrement DB ticket ${ticket.ticket_id}:`, logError.message);
      // Ne pas bloquer le flow principal
    }
    
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

    try {
      await ticketGenerationService.saveErrorLog(ticket.ticket_id, ticket, error);
    } catch (logError) {
      console.warn(`[TICKET_PROCESSOR] Échec log erreur DB ticket ${ticket.ticket_id}:`, logError.message);
    }
    
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
    
    // Préparer les données du webhook avec gestion des succès/échecs
    const webhookTickets = results.map(ticket => ({
      ticketId: ticket.ticket_id,
      ticketCode: ticket.ticket_code,
      qrCodeData: ticket.qr_code_data,
      fileUrl: ticket.file_url,
      filePath: ticket.file_path,
      generatedAt: ticket.generated_at,
      success: ticket.status === 'completed'
    }));

    const webhookData = {
      tickets: webhookTickets,
      summary: {
        total: data.tickets.length,
        successful: successCount,
        failed: failureCount,
        processingTime: processingTime
      }
    };

    // Envoyer le webhook selon le résultat
    let webhookResult;
    if (failureCount === 0) {
      // Succès complet
      webhookResult = await ticketWebhookService.sendGenerationCompleted(data.job_id, webhookData);
    } else if (successCount === 0) {
      // Échec complet
      webhookResult = await ticketWebhookService.sendGenerationFailed(data.job_id, {
        ...webhookData,
        error: 'Tous les tickets ont échoué'
      });
    } else {
      // Succès partiel
      webhookResult = await ticketWebhookService.sendGenerationPartial(data.job_id, webhookData);
    }
    
    // Garder l'émission Redis pour compatibilité (deprecated)
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
    
    // Émission de l'erreur vers event-planner-core via webhook HTTP
    const errorWebhookData = {
      tickets: [], // Pas de tickets générés en cas d'erreur critique
      error: error.message,
      summary: {
        total: data.tickets?.length || 0,
        successful: 0,
        failed: data.tickets?.length || 0,
        processingTime: 0
      }
    };

    // Envoyer le webhook d'erreur
    await ticketWebhookService.sendGenerationFailed(data.job_id, errorWebhookData);
    
    // Garder l'émission Redis pour compatibilité (deprecated)
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
    await ticketQueueService.queues.ticketGenerated.add('generation-result', result, {
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
  const queue = ticketQueueService.queues.ticketGeneration;
  
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
