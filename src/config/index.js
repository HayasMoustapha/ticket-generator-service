/**
 * Configuration centrale du Ticket Generator Service
 * Exporte tous les modules de configuration
 *
 * Note: Ce service est passif et technique, il n'a pas besoin d'authClient
 * L'authentification est gérée par event-planner-core
 */

const database = require('./database');

module.exports = {
  database
};
