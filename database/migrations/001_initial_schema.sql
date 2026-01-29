-- ============================================
-- TICKET GENERATOR SERVICE - Initial Schema
-- Service spécialisé pour la génération de tickets
-- ============================================

-- Extension pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table ticket_generation_logs (logs des traitements)
CREATE TABLE IF NOT EXISTS ticket_generation_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL, -- Référence au job dans event-planner-core (pas une clé étrangère)
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    message TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table generated_tickets (tickets générés)
CREATE TABLE IF NOT EXISTS generated_tickets (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL, -- Référence au job dans event-planner-core (pas une clé étrangère)
    ticket_code VARCHAR UNIQUE NOT NULL,
    qr_code_data TEXT,
    template_id BIGINT,
    guest_id BIGINT,
    event_id BIGINT,
    pdf_file_path VARCHAR,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_job_id ON ticket_generation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_status ON ticket_generation_logs(status);
CREATE INDEX IF NOT EXISTS idx_ticket_generation_logs_created_at ON ticket_generation_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_generated_tickets_job_id ON generated_tickets(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_ticket_code ON generated_tickets(ticket_code);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_template_id ON generated_tickets(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_guest_id ON generated_tickets(guest_id);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_event_id ON generated_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_generated_tickets_generated_at ON generated_tickets(generated_at);

-- Commentaires pour documentation
COMMENT ON TABLE ticket_generation_logs IS 'Logs des opérations de génération';
COMMENT ON TABLE generated_tickets IS 'Tickets générés avec tracking';
