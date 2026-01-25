const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Configuration Redis pour le Ticket Generator Service
 * Gère le cache et la protection contre les attaques par replay
 */
class RedisConfig {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };
  }

  /**
   * Initialise la connexion Redis
   */
  async connect() {
    try {
      this.client = redis.createClient(this.config);
      
      this.client.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
        this.isConnected = false;
      });
      
      this.client.on('connect', () => {
        logger.info('Redis connected successfully');
        this.isConnected = true;
      });
      
      this.client.on('ready', () => {
        logger.info('Redis ready for commands');
      });
      
      this.client.on('end', () => {
        logger.info('Redis connection ended');
        this.isConnected = false;
      });
      
      await this.client.connect();
      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Déconnecte Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
    }
  }

  /**
   * Vérifie si Redis est connecté
   */
  isReady() {
    return this.isConnected && this.client;
  }

  /**
   * Stocke une valeur avec TTL
   */
  async setWithTTL(key, value, ttlSeconds) {
    if (!this.isReady()) return false;
    
    try {
      await this.client.setEx(key, ttlSeconds, value);
      return true;
    } catch (error) {
      logger.error('Redis SETEX failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Vérifie si une clé existe
   */
  async exists(key) {
    if (!this.isReady()) return false;
    
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Récupère une valeur
   */
  async get(key) {
    if (!this.isReady()) return null;
    
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Supprime une clé
   */
  async del(key) {
    if (!this.isReady()) return false;
    
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis DEL failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Incrémente un compteur
   */
  async incr(key) {
    if (!this.isReady()) return null;
    
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis INCR failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Ajoute à une liste
   */
  async lpush(key, ...values) {
    if (!this.isReady()) return 0;
    
    try {
      return await this.client.lPush(key, values);
    } catch (error) {
      logger.error('Redis LPUSH failed', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Récupère les statistiques de Redis
   */
  async getStats() {
    if (!this.isReady()) return null;
    
    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace
      };
    } catch (error) {
      logger.error('Redis stats failed', { error: error.message });
      return null;
    }
  }

  /**
   * Nettoie les clés expirées
   */
  async cleanupExpiredKeys(pattern = 'qr_nonce:*') {
    if (!this.isReady()) return 0;
    
    try {
      const keys = await this.client.keys(pattern);
      let deleted = 0;
      
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1) { // No TTL set
          await this.client.del(key);
          deleted++;
        }
      }
      
      logger.info('Redis cleanup completed', { 
        pattern, 
        totalKeys: keys.length, 
        deleted 
      });
      
      return deleted;
    } catch (error) {
      logger.error('Redis cleanup failed', { pattern, error: error.message });
      return 0;
    }
  }
}

module.exports = new RedisConfig();
