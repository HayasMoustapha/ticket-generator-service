-- Migration initiale pour Ticket Generator Service
-- Basé sur ticket-generaor-diagram.md

-- Extension UUID pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Types énumérés pour les jobs de génération de tickets
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table des jobs de génération de tickets
CREATE TABLE IF NOT EXISTS ticket_generation_jobs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    status job_status DEFAULT 'pending',
    details JSONB,
    event_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    ticket_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Table des logs de génération
CREATE TABLE IF NOT EXISTS ticket_generation_logs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    job_id BIGINT REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
    message TEXT,
    level VARCHAR(20) DEFAULT 'info',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_event_id ON ticket_generation_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_status ON ticket_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_user_id ON ticket_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_created_at ON ticket_generation_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_job_id ON ticket_generation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_created_at ON ticket_generation_logs(created_at);

-- Commentaires pour documentation
COMMENT ON TABLE ticket_generation_jobs IS 'Jobs de génération de tickets';
COMMENT ON TABLE ticket_generation_logs IS 'Logs des opérations de génération';

-- Insertion d'un job de test
INSERT INTO ticket_generation_jobs (status, details, event_id, user_id, ticket_count) VALUES 
('pending', '{"template": "standard", "format": "pdf"}', 1, 1, 1)
ON CONFLICT DO NOTHING;
