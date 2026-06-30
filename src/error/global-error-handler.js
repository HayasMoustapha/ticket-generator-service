/**
 * Gestionnaire d'erreurs Express global (ticket-generator-service).
 *
 * Objectif ERROR-UX : une erreur remontée via next(error) ne doit pas être
 * systématiquement écrasée en 500 INTERNAL_SERVER_ERROR. Si l'erreur est
 * explicitement typée (statut HTTP + code UPPER_SNAKE stable), on l'honore ;
 * sinon on retombe sur un 500 générique coché (faute interne réelle).
 *
 * Extrait de server.js pour être unitairement prouvable.
 */

const logger = require('../utils/logger');

function buildGlobalErrorHandler() {
  return function globalErrorHandler(error, req, res, next) {
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      method: req?.method,
      url: req?.url,
      ip: req?.ip,
      userAgent: req?.get ? req.get('User-Agent') : undefined
    });

    const isDevelopment = process.env.NODE_ENV === 'development';

    const httpStatus =
      Number(error.statusCode) ||
      Number(error.status) ||
      Number(error.httpStatus) ||
      500;

    const stableCode =
      (typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) && error.code) ||
      (httpStatus >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

    // Erreur client typée (statut < 500) : message clair conservé.
    const isExplicitClientError =
      httpStatus < 500 && (error.statusCode || error.status || error.httpStatus);

    const message =
      isExplicitClientError && error.message
        ? error.message
        : isDevelopment
          ? error.message
          : 'Erreur interne du serveur';

    const payload = {
      success: false,
      message,
      error: { code: stableCode },
      timestamp: new Date().toISOString()
    };

    if (isDevelopment) {
      payload.error.stack = error.stack;
    }

    return res.status(httpStatus).json(payload);
  };
}

module.exports = { buildGlobalErrorHandler };
