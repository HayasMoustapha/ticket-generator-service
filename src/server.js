/**
 * 🎫 TICKET GENERATOR SERVICE - SERVEUR PRINCIPAL
 * 
 * RÔLE : Service technique de génération de tickets QR codes et PDFs
 * PORT : 3004
 * 
 * RESPONSABILITÉS :
 * - Génération technique de QR codes
 * - Génération technique de PDFs tickets
 * - Traitement en lot de tickets
 * - Gestion des files d'attente Redis
 * - Stockage des fichiers générés
 * 
 * NE GÈRE PAS :
 * - L'authentification utilisateur (délégué à event-planner-auth)
 * - La logique métier (délégué à event-planner-core)
 * - La validation de tickets (délégué à scan-validation-service)
 * - La gestion des événements (délégué à event-planner-core)
 * - La gestion des utilisateurs (délégué à event-planner-core)
 */

// ========================================
// 📄 IMPORTATIONS ET CONFIGURATION INITIALE
// ========================================
// Chargement des variables d'environnement depuis le fichier .env
require('dotenv').config();

// Express : Framework web pour créer le serveur
const express = require('express');
// CORS : Middleware pour autoriser les requêtes cross-origin
const cors = require('cors');
// Compression : Middleware pour compresser les réponses
const compression = require('compression');
// RateLimit : Middleware pour limiter les requêtes (protection contre abus)
const rateLimit = require('express-rate-limit');
// Morgan : Middleware pour logger les requêtes HTTP
const morgan = require('morgan');
// Helmet : Middleware pour sécuriser les en-têtes HTTP
const helmet = require('helmet');

// Import des services et routes internes
const logger = require('./utils/logger');
const healthRoutes = require('./routes/health-routes');
const ticketsRoutes = require('./api/routes/tickets.routes');
const queuesRoutes = require('./api/routes/queues.routes');
const { initializeTicketGeneratorService, shutdownTicketGeneratorService } = require('./services/ticket-generator-service');
const { buildGlobalErrorHandler } = require('./error/global-error-handler');

/**
 * �️ CLASSE PRINCIPALE DU SERVEUR
 * 
 * Configure et démarre le service de génération de tickets.
 * Ce service est purement technique et ne contient aucune logique métier.
 */
class TicketGeneratorServer {
  
  /**
   * 🔧 CONSTRUCTEUR DU SERVEUR
   * 
   * Initialise l'application Express et configure tous les composants.
   * Le service est conçu pour fonctionner sans authentification utilisateur.
   */
  constructor() {
    // Création de l'application Express
    this.app = express();
    // Port d'écoute (3004 par défaut, ou depuis les variables d'environnement)
    this.port = process.env.PORT || 3004;
    
    // Configuration des différents composants du serveur
    this.setupMiddleware();    // Configuration des middlewares techniques
    this.setupRoutes();        // Configuration des routes API
    this.setupErrorHandling(); // Configuration de la gestion des erreurs
  }

  /**
   * ⚙️ CONFIGURATION DES MIDDLEWARES TECHNIQUES
   * 
   * Configure les middlewares de sécurité, parsing et logging.
   * Note : Pas d'authentification - service technique pur.
   */
  setupMiddleware() {
    // 🛡️ SÉCURITÉ DES EN-TÊTES HTTP (Helmet)
    // Configure les en-têtes de sécurité (CSP, X-Frame-Options, etc.)
    this.app.use(helmet());

    // 🌐 CONFIGURATION CORS (Cross-Origin Resource Sharing)
    // Restreint les origines au Core Service uniquement
    // Permet à event-planner-core d'appeler ce service
    this.app.use(cors({
      origin: [process.env.CORS_ORIGIN || 'http://localhost:3001', 'http://localhost:3099'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // � COMPRESSION DES RÉPONSES
    // Compresse les réponses pour réduire la taille des données transférées
    this.app.use(compression());

    // � PARSING DES DONNÉES ENTRANTES
    // Parse les corps de requête au format JSON (limite 10MB pour les QR codes)
    this.app.use(express.json({ limit: '10mb' }));
    // Parse les données de formulaires URL-encoded (limite 10MB)
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 🚦 LIMITATION DE DÉBIT (Rate Limiting)
    // Protège contre les abus en limitant le nombre de requêtes par IP
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // Fenêtre de temps (15 minutes par défaut)
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Nombre max de requêtes par fenêtre
      message: {  // Message d'erreur quand la limite est dépassée
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    });
    // Application du rate limiting à toutes les routes
    this.app.use(limiter);

    // � LOGGING TECHNIQUE
    // Active le logging HTTP uniquement en production (pas en test)
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        // Redirige les logs de Morgan vers notre logger personnalisé
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // � LOGGING PERSONNALISÉ DES REQUÊTES
    // Middleware personnalisé pour logger chaque requête entrante
    this.app.use((req, res, next) => {
      logger.info('Incoming request', {
        method: req.method,        // Méthode HTTP (GET, POST, etc.)
        url: req.url,              // URL de la requête
        ip: req.ip,                // Adresse IP du client
        userAgent: req.get('User-Agent')  // Navigateur/client utilisé
      });
      next();  // Passe au middleware suivant
    });
  }

  /**
   * 🛣️ CONFIGURATION DES ROUTES
   * 
   * Configure toutes les routes du service.
   * Note : Aucune route n'est protégée par authentification.
   */
  setupRoutes() {
    // 🏠 ROUTE RACINE - Informations sur le service
    // Endpoint public pour vérifier que le service fonctionne
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Ticket Generator Service',  // Nom du service
        version: process.env.npm_package_version || '1.0.0',  // Version du service
        status: 'running',  // État actuel
        timestamp: new Date().toISOString()  // Date et heure actuelles
      });
    });

    // 🏥 ROUTES DE SANTÉ - Monitoring technique
    // Endpoints publics pour le monitoring du service
    this.app.use('/', healthRoutes);

    // � ROUTE API RACINE - Documentation de l'API
    // Route qui liste tous les endpoints disponibles
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'Ticket Generator API',  // Nom de l'API
        version: process.env.npm_package_version || '1.0.0',  // Version
        endpoints: {  // Liste des endpoints disponibles
          health: '/',
          metrics: '/metrics',
          status: '/status'
        },
        documentation: '/api/docs',
        timestamp: new Date().toISOString()
      });
    });

    // 🎫 ROUTES TICKETS - Génération de tickets
    this.app.use('/api/tickets', ticketsRoutes);

    // 🎫 ROUTE INFO TICKETS - Informations sur le service tickets
    this.app.get('/api/tickets/', (req, res) => {
      res.json({
        service: 'Ticket Generator API',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        endpoints: {
          generate: 'POST /api/tickets/generate',
          qrGenerate: 'POST /api/tickets/qr/generate',
          batch: 'POST /api/tickets/batch',
          pdf: 'POST /api/tickets/pdf',
          batchPdf: 'POST /api/tickets/batch-pdf',
          fullBatch: 'POST /api/tickets/full-batch',
          jobStatus: 'GET /api/tickets/job/:jobId/status',
          cancelJob: 'DELETE /api/tickets/job/:jobId/cancel',
          createJob: 'POST /api/tickets/jobs',
          processJob: 'POST /api/tickets/jobs/:jobId/process',
          listJobs: 'GET /api/tickets/jobs',
          download: 'GET /api/tickets/:ticketId/download',
          qrcode: 'GET /api/tickets/:ticketId/qrcode',
          queueStats: 'GET /api/tickets/queue/stats',
          queueClean: 'POST /api/tickets/queue/clean',
          eventTickets: 'GET /api/tickets/events/:eventId/tickets',
          eventStats: 'GET /api/tickets/events/:eventId/stats'
        },
        timestamp: new Date().toISOString()
      });
    });

    // 📋 ROUTES QUEUES - Gestion des files d'attente
    this.app.use('/api/queues', queuesRoutes);

    // Documentation Swagger — http://localhost:3004/docs
    const { specs: swaggerSpecs, swaggerUi, swaggerUiOptions } = require('./config/swagger');
    this.app.use('/docs', swaggerUi.serve);
    this.app.get('/docs', swaggerUi.setup(swaggerSpecs, swaggerUiOptions));

    // 🚫 ROUTE 404 - Gestion des routes non trouvées
    // Route par défaut pour les URLs qui n'existent pas
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        error: {
          code: 'NOT_FOUND',
          path: req.originalUrl  // URL demandée qui n'existe pas
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure la gestion des erreurs
   * Définit comment les erreurs sont traitées et retournées
   */
  setupErrorHandling() {
    // ========================================
    // 🚨 GESTIONNAIRE D'ERREURS GLOBAL
    // ========================================
    // Intercepte toutes les erreurs non gérées dans l'application.
    // ERROR-UX : honore une erreur explicitement typée (statut + code stable)
    // plutôt que d'écraser tout en 500 INTERNAL_SERVER_ERROR. Logique extraite
    // dans src/error/global-error-handler.js pour être unitairement prouvable.
    this.app.use(buildGlobalErrorHandler());

    // ========================================
    // ⚠️ GESTION DES PROMESSES REJETÉES
    // ========================================
    // Capture les promesses rejetées non gérées pour éviter les crashes
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,  // La promesse qui a été rejetée
        reason: reason.message || reason  // La raison du rejet
      });
    });

    // ========================================
    // 🚨 GESTION DES EXCEPTIONS NON CAPTURÉES
    // ========================================
    // Capture les exceptions qui ne sont pas gérées par try/catch
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        error: error.message,  // Message de l'exception
        stack: error.stack     // Pile d'appels pour débogage
      });
      
      // Arrêter le serveur proprement pour éviter un état corrompu
      this.gracefulShutdown('SIGTERM');
    });

    // ========================================
    // 🔄 GESTION DES SIGNAUX SYSTÈME
    // ========================================
    // Gestion du signal SIGTERM (demande d'arrêt du système)
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received');
      this.gracefulShutdown('SIGTERM');
    });

    // Gestion du signal SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('SIGINT received');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Démarre le serveur
   * Initialise les services et commence à écouter les requêtes
   */
  async start() {
    try {
      // ========================================
      // 🚀 BOOTSTRAP DE LA BASE DE DONNÉES
      // ========================================
      // Initialisation de la base de données avant tout autre service
      const bootstrap = require('./bootstrap');
      await bootstrap.initialize();
      
      // ========================================
      // 🚀 INITIALISATION DU SERVICE DE GÉNÉRATION
      // ========================================
      // Initialise le service de génération de tickets (Redis, consommateur, etc.)
      const serviceInitialized = await initializeTicketGeneratorService();
      
      if (!serviceInitialized) {
        throw new Error('Impossible d\'initialiser le service de génération de tickets');
      }
      
      logger.info('🚀 Starting Ticket Generator Service server...');
      
      // ========================================
      // 🎯 DÉMARRAGE DU SERVEUR HTTP
      // ========================================
      // Le serveur commence à écouter les requêtes sur le port configuré
      this.server = this.app.listen(this.port, () => {
        logger.info(`Ticket Generator Service started successfully`, {
          port: this.port,  // Port d'écoute
          environment: process.env.NODE_ENV || 'development',  // Environnement (dev/prod)
          version: process.env.npm_package_version || '1.0.0',  // Version du service
          pid: process.pid,  // ID du processus
          capabilities: {  // Capacités du service
            qrCodes: true,        // Génération de QR codes
            pdfGeneration: true,   // Génération de PDFs
            batchProcessing: true, // Traitement en lot
            redisQueue: true,      // Communication asynchrone Redis Queue
            healthChecks: true,    // Health checks
            metrics: true          // Métriques de performance
          }
        });
      });
    } catch (error) {
      // En cas d'erreur lors du démarrage, on log et on quitte
      logger.error('❌ Failed to start server:', error);
      process.exit(1);  // Quitte avec un code d'erreur
    }

    // ========================================
    // 🚨 GESTION DES ERREURS DE SERVEUR
    // ========================================
    // Intercepte les erreurs du serveur HTTP
    this.server.on('error', (error) => {
      // Si ce n'est pas une erreur de type "listen", on la propage
      if (error.syscall !== 'listen') {
        throw error;
      }

      // Détermine le type d'adresse (port ou pipe)
      const bind = typeof this.port === 'string'
        ? 'Pipe ' + this.port    // Pour les sockets Unix
        : 'Port ' + this.port;   // Pour les ports TCP

      // Gère les erreurs spécifiques au démarrage
      switch (error.code) {
        case 'EACCES':  // Erreur de permissions
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);  // Quitte avec code d'erreur
          break;
        case 'EADDRINUSE':  // Port déjà utilisé
          logger.error(`${bind} is already in use`);
          process.exit(1);  // Quitte avec code d'erreur
          break;
        default:  // Autre erreur
          throw error;  // Propage l'erreur
      }
    });
  }

  /**
   * Arrête proprement le serveur
   * Ferme les connexions existantes et libère les ressources
   * @param {string} signal - Signal reçu (SIGTERM, SIGINT, etc.)
   */
  async gracefulShutdown(signal) {
    logger.info(`Graceful shutdown initiated by ${signal}`);

    try {
      // ========================================
      // 🛑 ARRÊT DES CONNEXIONS HTTP
      // ========================================
      // Ferme le serveur HTTP pour ne plus accepter de nouvelles requêtes
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // ========================================
      // 🔴 ARRÊT DU SERVICE DE GÉNÉRATION
      // ========================================
      // Ferme le service de génération de tickets (Redis, consommateur, etc.)
      try {
        await shutdownTicketGeneratorService();
        logger.info('Ticket Generator Service shut down');
      } catch (error) {
        logger.error('Error shutting down Ticket Generator Service', {
          error: error.message
        });
      }

      // ========================================
      // ✅ ARRÊT TERMINÉ
      // ========================================
      logger.info('Graceful shutdown completed');
      process.exit(0);  // Quitte avec succès
    } catch (error) {
      // En cas d'erreur pendant l'arrêt
      logger.error('Error during graceful shutdown', {
        error: error.message
      });
      process.exit(1);  // Quitte avec code d'erreur
    }
  }
}

// ========================================
// 🚀 DÉMARRAGE AUTOMATIQUE
// ========================================
// Démarrer le serveur si ce fichier est exécuté directement (node src/server.js)
if (require.main === module) {
  const server = new TicketGeneratorServer();
  server.start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

// Export de la classe pour utilisation directe
module.exports = TicketGeneratorServer;

// Export de l'app Express pour les tests
const testServerInstance = new TicketGeneratorServer();
module.exports.app = testServerInstance.app;
