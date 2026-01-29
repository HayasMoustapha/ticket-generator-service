require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// Créer une connexion à la base de données (après qu'elle ait été créée)
const createConnection = () => {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'event_planner_ticket-generator-service',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
};

const connection = createConnection();

/**
 * Service de Bootstrap de Base de Données simplifié
 */
class DatabaseBootstrap {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../../src/database/migrations');
    this.bootstrapPath = path.join(__dirname, '../../src/database/bootstrap');
    this.lockId = 12345;
  }

  /**
   * Initialise la base de données (méthode OBLIGATOIRE)
   */
  async initialize() {
    let lockAcquired = false;
    
    try {
      if (process.env.DB_AUTO_BOOTSTRAP !== 'true') {
        console.log('⚠️  Bootstrap automatique désactivé (DB_AUTO_BOOTSTRAP != true)');
        return { success: true, message: 'Bootstrap désactivé', actions: [] };
      }

      console.log('�� Démarrage du bootstrap de la base de données...');
      const startTime = Date.now();
      const actions = [];

      // Acquérir le verrou
      await this.acquireLock();
      lockAcquired = true;

      // Créer la table schema_migrations
      await this.createSchemaMigrationsTable();
      actions.push('schema_migrations');

      // Appliquer les migrations
      const appliedMigrations = await this.applyMigrations();
      actions.push(...appliedMigrations);

      const duration = Date.now() - startTime;
      console.log(`✅ Bootstrap terminé en ${duration}ms`);

      return {
        success: true,
        message: 'Bootstrap réussi',
        duration,
        actions,
        migrationsApplied: appliedMigrations.length
      };

    } catch (error) {
      console.error('❌ Erreur lors du bootstrap:', error.message);
      throw error;
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Crée la base de données si elle n'existe pas
   */
  async ensureDatabaseExists() {
    const { Pool } = require('pg');
    
    const tempConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: 'postgres'
    };
    
    const tempPool = new Pool(tempConfig);
    const tempClient = await tempPool.connect();
    
    try {
      const databaseName = process.env.DB_NAME || 'event_planner_ticket-generator-service';
      
      const checkQuery = `
        SELECT 1 FROM pg_database 
        WHERE datname = '${databaseName}'
      `;
      const result = await tempClient.query(checkQuery);
      
      if (result.rows.length === 0) {
        const createQuery = `CREATE DATABASE "${databaseName}"`;
        await tempClient.query(createQuery);
        console.log(`✅ Base de données ${databaseName} créée avec succès`);
      } else {
        console.log(`ℹ️  La base de données ${databaseName} existe déjà`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la base de données:', error.message);
      throw error;
    } finally {
      tempClient.release();
      await tempPool.end();
    }
  }

  /**
   * Crée la base de données et la table de contrôle schema_migrations
   */
  async createSchemaMigrationsTable() {
    await this.ensureDatabaseExists();
    
    const client = await connection.connect();
    try {
      const bootstrapSql = await fs.readFile(
        path.join(this.bootstrapPath, '001_create_schema_migrations.sql'),
        'utf8'
      );
      await client.query(bootstrapSql);
      console.log('✅ Table schema_migrations vérifiée/créée');
    } finally {
      client.release();
    }
  }

  /**
   * Applique les migrations en attente
   */
  async applyMigrations() {
    const appliedMigrations = [];
    
    const migrationFiles = await this.getMigrationFiles();
    
    for (const file of migrationFiles) {
      const migrationName = path.basename(file);
      
      if (await this.isMigrationApplied(migrationName)) {
        console.log(`⏭️  Migration déjà appliquée: ${migrationName}`);
        continue;
      }
      
      await this.applyMigration(file, migrationName);
      appliedMigrations.push(migrationName);
    }
    
    return appliedMigrations;
  }

  /**
   * Récupère les fichiers de migration dans l'ordre
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort()
        .map(file => path.join(this.migrationsPath, file));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Dossier migrations vide ou inexistant');
        return [];
      }
      throw error;
    }
  }

  /**
   * Vérifie si une migration a déjà été appliquée
   */
  async isMigrationApplied(migrationName) {
    const client = await connection.connect();
    try {
      const result = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Applique une migration spécifique
   */
  async applyMigration(filePath, migrationName) {
    const client = await connection.connect();
    try {
      await client.query('BEGIN');
      
      const migrationSQL = await fs.readFile(filePath, 'utf8');
      await client.query(migrationSQL);
      
      const fileStats = await fs.stat(filePath);
      const checksum = crypto.createHash('sha256').update(migrationSQL).digest('hex');
      
      await client.query(`
        INSERT INTO schema_migrations (migration_name, checksum, file_size, execution_time_ms)
        VALUES ($1, $2, $3, $4)
      `, [migrationName, checksum, fileStats.size, 0]);
      
      await client.query('COMMIT');
      console.log(`✅ Migration appliquée: ${migrationName}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Erreur migration ${migrationName}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Acquiert un verrou PostgreSQL
   */
  async acquireLock() {
    const client = await connection.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT pg_advisory_lock($1)', [this.lockId]);
      console.log('🔒 Verrou de bootstrap acquis');
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Libère le verrou PostgreSQL
   */
  async releaseLock() {
    const client = await connection.connect();
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [this.lockId]);
      console.log('🔓 Verrou de bootstrap libéré');
    } finally {
      client.release();
    }
  }
}

module.exports = new DatabaseBootstrap();
