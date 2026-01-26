-- Migration initiale pour Ticket Generator Service
-- Basé sur ticket-generator-diagram.md

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT
);

-- Table des logs de génération
CREATE TABLE IF NOT EXISTS ticket_generation_logs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    job_id BIGINT REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
    message TEXT,
    level VARCHAR(20) DEFAULT 'info',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT
);

-- Table des tickets générés (pour tracking)
CREATE TABLE IF NOT EXISTS generated_tickets (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    job_id BIGINT REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
    ticket_code VARCHAR(255) UNIQUE NOT NULL,
    qr_code_data TEXT,
    pdf_path VARCHAR(500),
    ticket_type VARCHAR(50) DEFAULT 'standard',
    template_id BIGINT,
    event_id BIGINT NOT NULL,
    guest_id BIGINT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_event_id ON ticket_generation_jobs(event_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_status ON ticket_generation_jobs(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_user_id ON ticket_generation_jobs(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_generation_jobs_created_at ON ticket_generation_jobs(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_job_id ON ticket_generation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_created_at ON ticket_generation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_job_id ON generated_tickets(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_generated_tickets_code ON generated_tickets(ticket_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_generated_tickets_event_id ON generated_tickets(event_id) WHERE deleted_at IS NULL;

-- Commentaires pour documentation
COMMENT ON TABLE ticket_generation_jobs IS 'Jobs de génération de tickets';
COMMENT ON TABLE ticket_generation_logs IS 'Logs des opérations de génération';
COMMENT ON TABLE generated_tickets IS 'Tickets générés avec tracking';
