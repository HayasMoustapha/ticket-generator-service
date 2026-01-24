/**
 * MIDDLEWARE D'AUTHENTIFICATION JWT STATELESS
 * Généré automatiquement pour ticket-generator-service
 * 
 * Ce middleware utilise le contrat JWT global pour valider les tokens
 * localement, sans dépendance à l'Auth Service.
 */

const { authenticate, requirePermission, requireRole } = require('../../../shared');

// Export pour compatibilité avec l'ancien système
module.exports = {
  authenticate,
  requirePermission,
  requireRole,
  
  // Anciens noms (compatibilité)
  optionalAuthenticate: require('../../../shared').optionalAuthenticate,
  requireAPIKey: (req, res, next) => next(), // Placeholder
  requireWebhookSecret: (req, res, next) => next(), // Placeholder
  requireStripeWebhook: (req, res, next) => next(), // Placeholder
  requirePayPalWebhook: (req, res, next) => next() // Placeholder
};
