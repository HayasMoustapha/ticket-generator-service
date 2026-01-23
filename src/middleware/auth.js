const jwt = require('jsonwebtoken');
const axios = require('axios');
const { errorResponse, forbiddenResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware d'authentification et d'autorisation
 * Valide les tokens JWT via l'Auth Service
 */

/**
 * Middleware d'authentification principal
 * Valide le token JWT et attache l'utilisateur à la requête
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(
        errorResponse('Token manquant ou mal formaté', null, 'MISSING_TOKEN')
      );
    }

    const token = authHeader.substring(7);

    // Valider le token via l'Auth Service
    validateTokenWithAuthService(token)
      .then(result => {
        if (!result.success || !result.valid) {
          logger.security('Authentication failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            error: result.error
          });

          return res.status(401).json(
            errorResponse('Token invalide ou expiré', null, 'INVALID_TOKEN')
          );
        }

        // Attacher les informations utilisateur à la requête
        req.user = result.user;
        req.token = token;
        req.authenticatedAt = new Date().toISOString();

        logger.auth('User authenticated successfully', {
          userId: req.user.id,
          ip: req.ip
        });

        next();
      })
      .catch(error => {
        logger.error('Authentication service error', {
          error: error.message,
          ip: req.ip
        });

        return res.status(500).json(
          errorResponse('Erreur d\'authentification', null, 'AUTH_ERROR')
        );
      });
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error.message,
      ip: req.ip
    });

    return res.status(500).json(
      errorResponse('Erreur d\'authentification', null, 'AUTH_ERROR')
    );
  }
}

/**
 * Middleware de vérification de permission
 * @param {string} permission - Permission requise
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json(
        errorResponse('Authentification requise', null, 'NOT_AUTHENTICATED')
      );
    }

    // Vérifier la permission via l'Auth Service
    checkPermissionWithAuthService(req.user.id, permission)
      .then(result => {
        if (!result.success || !result.allowed) {
          logger.security('Access denied - insufficient permission', {
            userId: req.user.id,
            permission,
            ip: req.ip
          });

          return res.status(403).json(
            forbiddenResponse('Permission insuffisante', permission)
          );
        }

        logger.auth('Permission granted', {
          userId: req.user.id,
          permission,
          ip: req.ip
        });

        next();
      })
      .catch(error => {
        logger.error('Permission check error', {
          error: error.message,
          userId: req.user.id,
          permission
        });

        return res.status(500).json(
          errorResponse('Erreur de vérification des permissions', null, 'PERMISSION_ERROR')
        );
      });
  };
}

/**
 * Middleware optionnel - authentification si token présent
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      // Pas de token, continuer sans authentification
      return next();
    }

    const token = authHeader.substring(7);

    // Tenter de valider le token
    validateTokenWithAuthService(token)
      .then(result => {
        if (result.success && result.valid) {
          req.user = result.user;
          req.token = token;
          req.authenticatedAt = new Date().toISOString();
        }
        next();
      })
      .catch(() => {
        // En cas d'erreur, continuer sans authentification
        next();
      });
  } catch (error) {
    // En cas d'erreur, continuer sans authentification
    logger.warn('Optional auth failed', {
      error: error.message,
      ip: req.ip
    });
    next();
  }
}

/**
 * Middleware de vérification de rôle
 * @param {string|Array} roles - Rôle(s) requis
 */
function requireRole(roles) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json(
        errorResponse('Authentification requise', null, 'NOT_AUTHENTICATED')
      );
    }

    // Récupérer les rôles de l'utilisateur via l'Auth Service
    getUserRolesFromAuthService(req.user.id)
      .then(result => {
        if (!result.success) {
          return res.status(500).json(
            errorResponse('Impossible de vérifier les rôles', null, 'ROLE_ERROR')
          );
        }

        const userRoles = result.roles || [];
        const userRoleNames = userRoles.map(r => r.name).filter(Boolean);

        // Vérifier si l'utilisateur a un des rôles requis
        const hasRequiredRole = requiredRoles.some(role => 
          userRoleNames.includes(role)
        );

        if (!hasRequiredRole) {
          logger.security('Access denied - insufficient role', {
            userId: req.user.id,
            userRoles: userRoleNames,
            requiredRoles,
            ip: req.ip
          });

          return res.status(403).json(
            forbiddenResponse('Rôle insuffisant', requiredRoles.join(' ou '))
          );
        }

        // Attacher les rôles à la requête
        req.userRoles = userRoleNames;

        logger.auth('Role access granted', {
          userId: req.user.id,
          userRoles: userRoleNames,
          ip: req.ip
        });

        next();
      })
      .catch(error => {
        logger.error('Role check error', {
          error: error.message,
          userId: req.user.id,
          requiredRoles
        });

        return res.status(500).json(
          errorResponse('Erreur de vérification des rôles', null, 'ROLE_ERROR')
        );
      });
  };
}

/**
 * Valide un token via l'Auth Service
 * @param {string} token - Token JWT à valider
 * @returns {Promise<Object>} Résultat de la validation
 */
async function validateTokenWithAuthService(token) {
  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    const authToken = process.env.AUTH_SERVICE_TOKEN;

    const response = await axios.post(
      `${authServiceUrl}/api/auth/validate-token`,
      { token },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      valid: true,
      user: response.data.data?.user || response.data.user
    };
  } catch (error) {
    logger.error('Auth service token validation failed', {
      error: error.message,
      status: error.response?.status
    });

    return {
      success: false,
      valid: false,
      error: error.response?.data || 'Token validation failed'
    };
  }
}

/**
 * Vérifie une permission via l'Auth Service
 * @param {number} userId - ID de l'utilisateur
 * @param {string} permission - Permission à vérifier
 * @returns {Promise<Object>} Résultat de la vérification
 */
async function checkPermissionWithAuthService(userId, permission) {
  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    const authToken = process.env.AUTH_SERVICE_TOKEN;

    const response = await axios.post(
      `${authServiceUrl}/api/authorizations/check`,
      { user_id: userId, permission },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      allowed: response.data.data?.allowed || response.data.allowed
    };
  } catch (error) {
    logger.error('Auth service permission check failed', {
      error: error.message,
      userId,
      permission
    });

    return {
      success: false,
      allowed: false,
      error: error.response?.data || 'Permission check failed'
    };
  }
}

/**
 * Récupère les rôles d'un utilisateur via l'Auth Service
 * @param {number} userId - ID de l'utilisateur
 * @returns {Promise<Object>} Rôles de l'utilisateur
 */
async function getUserRolesFromAuthService(userId) {
  try {
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    const authToken = process.env.AUTH_SERVICE_TOKEN;

    const response = await axios.get(
      `${authServiceUrl}/api/users/${userId}/roles`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      roles: response.data.data?.roles || response.data.roles
    };
  } catch (error) {
    logger.error('Auth service roles fetch failed', {
      error: error.message,
      userId
    });

    return {
      success: false,
      roles: [],
      error: error.response?.data || 'Roles fetch failed'
    };
  }
}

module.exports = {
  authenticate,
  requirePermission,
  optionalAuth,
  requireRole,
  validateTokenWithAuthService,
  checkPermissionWithAuthService,
  getUserRolesFromAuthService
};
