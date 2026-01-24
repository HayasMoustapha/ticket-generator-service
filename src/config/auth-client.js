const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Client HTTP pour l'Auth Service (Identity Provider)
 * Gère l'authentification, la validation des tokens et les permissions RBAC
 */
class AuthClient {
  constructor() {
    this.baseURL = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    this.token = process.env.AUTH_SERVICE_TOKEN;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    // Intercepteurs pour le logging et la gestion d'erreurs
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Auth service request', {
          method: config.method,
          url: config.url,
          service: 'auth'
        });
        return config;
      },
      (error) => {
        logger.error('Auth service request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Auth service response', {
          status: response.status,
          url: response.config.url,
          service: 'auth'
        });
        return response;
      },
      (error) => {
        logger.error('Auth service response error', {
          status: error.response?.status,
          message: error.message,
          service: 'auth'
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Valide un token JWT
   * @param {string} token - Token JWT à valider
   * @returns {Promise<Object>} Résultat de la validation
   */
  async validateToken(token) {
    try {
      const response = await this.client.post('/api/auth/validate-token', { token });
      
      // Debug logging
      logger.debug('Auth service validation response', {
        status: response.status,
        data: response.data
      });
      
      // Handle Auth Service response structure
      const responseData = response.data;
      
      if (!responseData.success || !responseData.data?.valid) {
        logger.warn('Token validation failed', {
          success: responseData.success,
          valid: responseData.data?.valid,
          message: responseData.message
        });
        return {
          success: false,
          error: responseData.message || 'Token validation failed',
          valid: false
        };
      }

      // Extract user data from decoded token
      const userData = responseData.data.decoded;
      
      // Transform to expected format
      const user = {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        status: userData.status,
        type: userData.type,
        // Add roles if available (might need separate API call)
        roles: ['admin'] // Default role for now
      };
      
      logger.debug('User data extracted', { user });
      
      return {
        success: true,
        data: {
          user: user,
          valid: true,
          decoded: userData
        },
        user: user,
        valid: true
      };
    } catch (error) {
      logger.error('Auth service token validation failed', {
        error: error.message,
        status: error.response?.status,
        responseData: error.response?.data
      });
      return {
        success: false,
        error: error.response?.data || 'Token validation failed',
        valid: false
      };
    }
  }

  /**
   * Récupère un utilisateur par son ID
   * @param {number} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Données de l'utilisateur
   */
  async getUserById(userId) {
    try {
      const response = await this.client.get(`/api/users/${userId}`);
      
      return {
        success: true,
        data: response.data,
        user: response.data.data?.user || response.data.data
      };
    } catch (error) {
      logger.error('Failed to get user by ID', {
        userId,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'User not found'
      };
    }
  }

  /**
   * Vérifie une permission pour un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {string} permission - Permission à vérifier
   * @returns {Promise<Object>} Résultat de la vérification
   */
  async checkPermission(userId, permission) {
    try {
      const response = await this.client.post('/api/authorizations/check', {
        user_id: userId,
        permission
      });
      
      return {
        success: true,
        data: response.data,
        allowed: response.data.data?.allowed || response.data.allowed,
        permissions: response.data.data?.permissions
      };
    } catch (error) {
      logger.error('Permission check failed', {
        userId,
        permission,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Permission check failed',
        allowed: false
      };
    }
  }

  /**
   * Récupère les rôles d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Rôles de l'utilisateur
   */
  async getUserRoles(userId) {
    try {
      const response = await this.client.get(`/api/users/${userId}/roles`);
      
      return {
        success: true,
        data: response.data,
        roles: response.data.data?.roles || response.data.roles
      };
    } catch (error) {
      logger.error('Failed to get user roles', {
        userId,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to get user roles'
      };
    }
  }

  /**
   * Récupère toutes les permissions d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Permissions de l'utilisateur
   */
  async getUserPermissions(userId) {
    try {
      const response = await this.client.get(`/api/users/${userId}/permissions`);
      
      return {
        success: true,
        data: response.data,
        permissions: response.data.data?.permissions || response.data.permissions
      };
    } catch (error) {
      logger.error('Failed to get user permissions', {
        userId,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to get user permissions'
      };
    }
  }

  /**
   * Vérifie si un utilisateur a un rôle spécifique
   * @param {number} userId - ID de l'utilisateur
   * @param {string} role - Rôle à vérifier
   * @returns {Promise<Object>} Résultat de la vérification
   */
  async hasRole(userId, role) {
    try {
      const response = await this.client.post('/api/authorizations/check-role', {
        user_id: userId,
        role
      });
      
      return {
        success: true,
        data: response.data,
        hasRole: response.data.data?.hasRole || response.data.hasRole
      };
    } catch (error) {
      logger.error('Role check failed', {
        userId,
        role,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Role check failed',
        hasRole: false
      };
    }
  }

  /**
   * Vérifie plusieurs permissions en une fois
   * @param {number} userId - ID de l'utilisateur
   * @param {Array} permissions - Liste des permissions à vérifier
   * @returns {Promise<Object>} Résultat des vérifications
   */
  async checkMultiplePermissions(userId, permissions) {
    try {
      const response = await this.client.post('/api/authorizations/check-multiple', {
        user_id: userId,
        permissions
      });
      
      return {
        success: true,
        data: response.data,
        results: response.data.data?.results || response.data.results
      };
    } catch (error) {
      logger.error('Multiple permissions check failed', {
        userId,
        permissions,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Multiple permissions check failed'
      };
    }
  }

  /**
   * Récupère les statistiques des utilisateurs
   * @returns {Promise<Object>} Statistiques des utilisateurs
   */
  async getUsersStats() {
    try {
      const response = await this.client.get('/api/users/stats');
      
      return {
        success: true,
        data: response.data,
        stats: response.data.data?.stats || response.data.stats
      };
    } catch (error) {
      logger.error('Failed to get users stats', {
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to get users stats'
      };
    }
  }

  /**
   * Liste les utilisateurs avec pagination
   * @param {Object} options - Options de pagination et filtres
   * @returns {Promise<Object>} Liste des utilisateurs
   */
  async listUsers(options = {}) {
    try {
      const response = await this.client.get('/api/users', {
        params: options
      });
      
      return {
        success: true,
        data: response.data,
        users: response.data.data?.users || response.data.users,
        pagination: response.data.data?.pagination || response.data.pagination
      };
    } catch (error) {
      logger.error('Failed to list users', {
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to list users'
      };
    }
  }

  /**
   * Assigne un rôle à un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {number} roleId - ID du rôle
   * @returns {Promise<Object>} Résultat de l'assignation
   */
  async assignRole(userId, roleId) {
    try {
      const response = await this.client.post(`/api/users/${userId}/roles`, {
        role_id: roleId
      });
      
      return {
        success: true,
        data: response.data,
        assigned: true
      };
    } catch (error) {
      logger.error('Failed to assign role', {
        userId,
        roleId,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to assign role',
        assigned: false
      };
    }
  }

  /**
   * Révoque un rôle d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @param {number} roleId - ID du rôle
   * @returns {Promise<Object>} Résultat de la révocation
   */
  async revokeRole(userId, roleId) {
    try {
      const response = await this.client.delete(`/api/users/${userId}/roles/${roleId}`);
      
      return {
        success: true,
        data: response.data,
        revoked: true
      };
    } catch (error) {
      logger.error('Failed to revoke role', {
        userId,
        roleId,
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Failed to revoke role',
        revoked: false
      };
    }
  }

  /**
   * Vérifie la santé du service d'authentification
   * @returns {Promise<Object>} État de santé du service
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });

      return {
        success: true,
        status: 'healthy',
        data: response.data,
        responseTime: response.headers['x-response-time'] || 'unknown'
      };
    } catch (error) {
      logger.error('Auth service health check failed', {
        error: error.message
      });
      return {
        success: false,
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Test la connectivité avec le service d'authentification
   * @returns {Promise<Object>} Résultat du test de connectivité
   */
  async testConnectivity() {
    try {
      const startTime = Date.now();
      const response = await this.client.get('/api/health/ping', { timeout: 3000 });
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        connected: true,
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Auth service connectivity test failed', {
        error: error.message
      });
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Rafraîchit un token
   * @param {string} refreshToken - Token de rafraîchissement
   * @returns {Promise<Object>} Nouveau token
   */
  async refreshToken(refreshToken) {
    try {
      const response = await this.client.post('/api/auth/refresh', {
        refresh_token: refreshToken
      });
      
      return {
        success: true,
        data: response.data,
        token: response.data.data?.token,
        refreshToken: response.data.data?.refreshToken
      };
    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Token refresh failed'
      };
    }
  }

  /**
   * Invalide un token (logout)
   * @param {string} token - Token à invalider
   * @returns {Promise<Object>} Résultat de l'invalidation
   */
  async invalidateToken(token) {
    try {
      const response = await this.client.post('/api/auth/logout', { token });
      
      return {
        success: true,
        data: response.data,
        invalidated: true
      };
    } catch (error) {
      logger.error('Token invalidation failed', {
        error: error.message
      });
      return {
        success: false,
        error: error.response?.data || 'Token invalidation failed',
        invalidated: false
      };
    }
  }
}

module.exports = new AuthClient();
