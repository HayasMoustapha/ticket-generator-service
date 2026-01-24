-- ========================================
-- TABLE DE CONTRÔLE DES MIGRATIONS
-- ========================================
-- Cette table suit l'état des migrations appliquées
-- Permet d'éviter les ré-exécutions et détecte les modifications
-- Note: La création de la base de données est gérée par ensureDatabaseExists()

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL,
    file_size BIGINT NOT NULL,
    execution_time_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);

-- Commentaires pour documentation
COMMENT ON TABLE schema_migrations IS 'Table de suivi des migrations de base de données';
COMMENT ON COLUMN schema_migrations.migration_name IS 'Nom du fichier de migration';
COMMENT ON COLUMN schema_migrations.checksum IS 'SHA256 du contenu du fichier pour détecter les modifications';
COMMENT ON COLUMN schema_migrations.file_size IS 'Taille du fichier en octets';
COMMENT ON COLUMN schema_migrations.execution_time_ms IS 'Temps d''exécution en millisecondes';
