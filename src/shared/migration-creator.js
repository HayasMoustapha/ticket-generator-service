const fs = require('fs').promises;
const path = require('path');

/**
 * Crée automatiquement les fichiers de migration de base pour un service
 */
class MigrationCreator {
  constructor(serviceName, databaseName) {
    this.serviceName = serviceName;
    this.databaseName = databaseName;
    this.migrationsPath = path.join(__dirname, '../../database/migrations');
  }

  /**
   * Crée les fichiers de migration de base s'ils n'existent pas
   */
  async createBasicMigrations() {
    try {
      // S'assurer que le dossier migrations existe
      await fs.mkdir(this.migrationsPath, { recursive: true });

      // Créer la migration initiale si elle n'existe pas
      const initialMigration = path.join(this.migrationsPath, '001_initial_schema.sql');
      
      if (!(await this.fileExists(initialMigration))) {
        await this.createInitialSchema(initialMigration);
        console.log(`✅ Migration initiale créée pour ${this.serviceName}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Erreur lors de la création des migrations pour ${this.serviceName}:`, error.message);
      return false;
    }
  }

  /**
   * Vérifie si un fichier existe
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Crée le schéma SQL initial
   */
  async createInitialSchema(filePath) {
    const schema = this.generateSchema();
    await fs.writeFile(filePath, schema, 'utf8');
  }

  /**
   * Génère le schéma SQL de base
   */
  generateSchema() {
    return `-- Migration initiale pour ${this.serviceName}
-- Crée les tables de base avec structure minimale

-- Extension UUID pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table de configuration du service (pour stocker des métadonnées)
CREATE TABLE IF NOT EXISTS service_config (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table d'audit pour suivre les opérations importantes
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    user_id BIGINT,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Commentaires pour documentation
COMMENT ON TABLE service_config IS 'Configuration du service ${this.serviceName}';
COMMENT ON TABLE audit_logs IS 'Journal d\'audit pour ${this.serviceName}';

-- Insertion de la configuration de base
INSERT INTO service_config (key, value, description) VALUES 
('service_name', '${this.serviceName}', 'Nom du service'),
('database_name', '${this.databaseName}', 'Nom de la base de données'),
('version', '1.0.0', 'Version du service'),
('initialized_at', CURRENT_TIMESTAMP, 'Date d\'initialisation')
ON CONFLICT (key) DO NOTHING;
`;
  }
}

module.exports = MigrationCreator;
