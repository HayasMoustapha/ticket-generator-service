const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { database } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Gestionnaire de migrations pour Notification Service
 */
class DatabaseMigrator {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../database/migrations');
  }

  /**
   * Initialise le système de migrations
   */
  async initialize() {
    try {
      // Créer la table des migrations si elle n'existe pas
      await database.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(50) NOT NULL UNIQUE,
          filename VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          checksum VARCHAR(64) NOT NULL
        )
      `);
      
      logger.info('Migration system initialized');
    } catch (error) {
      logger.error('Failed to initialize migration system:', error);
      throw error;
    }
  }

  /**
   * Calcule le checksum d'un fichier
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Récupère les fichiers de migration
   */
  getMigrationFiles() {
    try {
      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      logger.info(`Found ${files.length} migration files`);
      return files;
    } catch (error) {
      logger.error('Failed to read migration files:', error);
      return [];
    }
  }

  /**
   * Récupère les migrations déjà exécutées
   */
  async getExecutedMigrations() {
    try {
      const result = await database.query(
        'SELECT version, filename, checksum FROM migrations ORDER BY version'
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get executed migrations:', error);
      return [];
    }
  }

  /**
   * Valide une migration
   */
  async validateMigration(filename) {
    try {
      const filePath = path.join(this.migrationsPath, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const currentChecksum = this.calculateChecksum(content);

      const executedMigrations = await this.getExecutedMigrations();
      const executedMigration = executedMigrations.find(m => m.filename === filename);

      if (executedMigration) {
        if (executedMigration.checksum !== currentChecksum) {
          if (process.env.DB_FORCE_MIGRATION === 'true') {
            logger.warn(`Migration ${filename} checksum mismatch, forcing update due to DB_FORCE_MIGRATION`);
            await database.query(
              'UPDATE migrations SET checksum = $1 WHERE version = $2',
              [currentChecksum, executedMigration.version]
            );
          } else {
            throw new Error(
              `Migration ${filename} checksum mismatch. ` +
              `Expected: ${executedMigration.checksum}, Got: ${currentChecksum}`
            );
          }
        }
        return { status: 'already_executed', checksum: currentChecksum };
      }

      return { status: 'pending', checksum: currentChecksum };
    } catch (error) {
      logger.error(`Failed to validate migration ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Exécute une migration
   */
  async executeMigration(filename) {
    try {
      const filePath = path.join(this.migrationsPath, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = this.calculateChecksum(content);

      logger.info(`Executing migration: ${filename}`);
      
      // Nettoyer le contenu SQL (supprimer les commandes CREATE DATABASE et \c)
      let cleanContent = content;
      cleanContent = cleanContent.replace(/CREATE DATABASE.*?;/g, '');
      cleanContent = cleanContent.replace(/\\c\s+\w+;?/g, '');

      await database.query('BEGIN');
      
      try {
        // Exécuter la migration
        await database.query(cleanContent);
        
        // Enregistrer la migration comme exécutée
        const version = filename.replace('.sql', '');
        await database.query(
          'INSERT INTO migrations (version, filename, checksum) VALUES ($1, $2, $3)',
          [version, filename, checksum]
        );
        
        await database.query('COMMIT');
        logger.info(`Migration ${filename} executed successfully`);
        
        return { success: true, filename };
      } catch (error) {
        await database.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to execute migration ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Exécute toutes les migrations en attente
   */
  async migrate() {
    try {
      await this.initialize();
      
      const migrationFiles = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      logger.info(`${executedMigrations.length} migrations already executed`);
      
      const executed = [];
      const skipped = [];
      
      for (const filename of migrationFiles) {
        const validation = await this.validateMigration(filename);
        
        if (validation.status === 'already_executed') {
          skipped.push(filename);
          logger.info(`Migration already executed: ${filename}`);
        } else {
          const result = await this.executeMigration(filename);
          if (result.success) {
            executed.push(filename);
          }
        }
      }
      
      logger.info(`Migration process completed. Executed: ${executed.length}/${migrationFiles.length}`);
      
      return {
        success: true,
        executed,
        skipped,
        total: migrationFiles.length
      };
    } catch (error) {
      logger.error('Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Réinitialise les migrations (développement uniquement)
   */
  async reset() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Reset operation is not allowed in production');
    }
    
    try {
      await database.query('TRUNCATE TABLE migrations RESTART IDENTITY');
      logger.info('Migration table reset');
    } catch (error) {
      logger.error('Failed to reset migrations:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseMigrator();
