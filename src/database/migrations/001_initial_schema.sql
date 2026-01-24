-- ============================================
-- TICKET GENERATOR SERVICE - Initial Schema
-- Diagram: /event-planner-documents/ticket-generator-service-diagram.md
-- ============================================

-- Créer la base de données si elle n'existe pas
-- Note: Exécuté automatiquement avec des droits étendus
CREATE DATABASE IF NOT EXISTS event_planner_ticket_generator;

-- Extension pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table principale selon le diagramme
CREATE TABLE IF NOT EXISTS ticket_generation_jobs (
    id BIGSERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    details JSONB DEFAULT '{}',
    event_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);



-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_status ON ticket_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_event_id ON ticket_generation_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_created_at ON ticket_generation_jobs(created_at);


-- Table de migration pour suivre les versions
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inscrire cette migration
INSERT INTO migration_history (filename) VALUES ('001_initial_schema.sql')
ON CONFLICT (filename) DO NOTHING;
