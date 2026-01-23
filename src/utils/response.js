/**
 * Utilitaires pour les réponses API standardisées
 */

/**
 * Réponse de succès
 * @param {string} message - Message de succès
 * @param {Object} data - Données à retourner
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function successResponse(message, data = null, meta = {}) {
  return {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse de création
 * @param {string} message - Message de succès
 * @param {Object} data - Données créées
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function createdResponse(message, data = null, meta = {}) {
  return {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      created: true,
      ...meta
    }
  };
}

/**
 * Réponse d'erreur
 * @param {string} message - Message d'erreur
 * @param {Object} data - Données d'erreur
 * @param {string} code - Code d'erreur
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function errorResponse(message, data = null, code = null, meta = {}) {
  return {
    success: false,
    message,
    error: {
      code,
      data
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse d'erreur de validation
 * @param {Array} errors - Liste des erreurs de validation
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function validationErrorResponse(errors, meta = {}) {
  return {
    success: false,
    message: 'Erreur de validation',
    error: {
      code: 'VALIDATION_ERROR',
      data: errors
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse d'erreur non trouvée
 * @param {string} resource - Type de ressource
 * @param {string} id - ID de la ressource
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function notFoundResponse(resource, id = null, meta = {}) {
  const message = id ? `${resource} avec ID ${id} non trouvé` : `${resource} non trouvé`;
  
  return {
    success: false,
    message,
    error: {
      code: 'NOT_FOUND',
      data: {
        resource,
        id
      }
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse d'accès interdit
 * @param {string} message - Message d'erreur
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function forbiddenResponse(message = 'Accès interdit', meta = {}) {
  return {
    success: false,
    message,
    error: {
      code: 'FORBIDDEN'
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse d'erreur serveur
 * @param {string} message - Message d'erreur
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function serverErrorResponse(message = 'Erreur interne du serveur', meta = {}) {
  return {
    success: false,
    message,
    error: {
      code: 'INTERNAL_SERVER_ERROR'
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Réponse paginée
 * @param {Array} data - Données paginées
 * @param {Object} pagination - Informations de pagination
 * @param {string} message - Message de succès
 * @param {Object} meta - Métadonnées additionnelles
 * @returns {Object} Réponse formatée
 */
function paginatedResponse(data, pagination, message = 'Données récupérées avec succès', meta = {}) {
  return {
    success: true,
    message,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrev: pagination.page > 1
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

module.exports = {
  successResponse,
  createdResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  forbiddenResponse,
  serverErrorResponse,
  paginatedResponse
};
