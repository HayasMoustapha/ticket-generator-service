-- Création de la table schema_migrations pour le suivi des migrations
-- Cette table est utilisée par le système de bootstrap pour suivre les migrations appliquées

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    checksum VARCHAR(64) NOT NULL,
    file_size BIGINT NOT NULL,
    execution_time_ms INTEGER,
    executed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);

-- Commentaires sur la table
COMMENT ON TABLE schema_migrations IS 'Table de suivi des migrations de base de données pour le service ticket-generator';
COMMENT ON COLUMN schema_migrations.migration_name IS 'Nom du fichier de migration';
COMMENT ON COLUMN schema_migrations.checksum IS 'Checksum SHA256 du fichier de migration';
COMMENT ON COLUMN schema_migrations.file_size IS 'Taille du fichier de migration en octets';
COMMENT ON COLUMN schema_migrations.execution_time_ms IS 'Temps d''exécution de la migration en millisecondes';
COMMENT ON COLUMN schema_migrations.executed_at IS 'Date et heure d''exécution de la migration';
