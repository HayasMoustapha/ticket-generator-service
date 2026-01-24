-- Ticket Generator Service Database Schema
-- Based on ticket-generaor-diagram.md and event-planner-core-diagram.md

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ticket-related enums
CREATE TYPE ticket_type AS ENUM ('free', 'paid', 'donation', 'vip', 'standard', 'early_bird');
CREATE TYPE ticket_status AS ENUM ('draft', 'generated', 'sent', 'used', 'expired', 'cancelled');
CREATE TYPE generation_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE template_type AS ENUM ('standard', 'vip', 'custom', 'early_bird');

-- Tickets table
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_code VARCHAR(255) NOT NULL UNIQUE,
    qr_code_data TEXT NOT NULL,
    event_id UUID NOT NULL,
    event_guest_id UUID,
    ticket_type ticket_type NOT NULL DEFAULT 'standard',
    status ticket_status DEFAULT 'draft',
    is_validated BOOLEAN DEFAULT false,
    validated_at TIMESTAMP WITH TIME ZONE,
    price DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    template_id UUID,
    generation_job_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket types table
CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type ticket_type NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    available_from TIMESTAMP WITH TIME ZONE,
    available_to TIMESTAMP WITH TIME ZONE,
    price DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    max_per_order INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket templates table
CREATE TABLE ticket_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type template_type NOT NULL DEFAULT 'standard',
    preview_url VARCHAR(500),
    source_files_path VARCHAR(500),
    is_customizable BOOLEAN DEFAULT false,
    template_data JSONB DEFAULT '{}',
    css_styles TEXT,
    html_template TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket generation jobs table
CREATE TABLE ticket_generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    status generation_status DEFAULT 'pending',
    total_tickets INTEGER DEFAULT 0,
    generated_tickets INTEGER DEFAULT 0,
    failed_tickets INTEGER DEFAULT 0,
    details JSONB DEFAULT '{}',
    template_id UUID,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket generation queue table (for Bull queue persistence)
CREATE TABLE ticket_generation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    opts JSONB DEFAULT '{}',
    progress INTEGER DEFAULT 0,
    delay INTEGER DEFAULT 0,
    timestamp INTEGER DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP),
    attempts INTEGER DEFAULT 0,
    finished_on INTEGER,
    processed_on INTEGER,
    failed_reason TEXT,
    stacktrace TEXT,
    returnvalue JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PDF storage table
CREATE TABLE ticket_pdfs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    storage_type VARCHAR(50) DEFAULT 'local',
    storage_url VARCHAR(500),
    is_public BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Batch generation requests table
CREATE TABLE batch_generation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    job_id UUID REFERENCES ticket_generation_jobs(id) ON DELETE CASCADE,
    request_data JSONB NOT NULL,
    status generation_status DEFAULT 'pending',
    total_requested INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_summary JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Template usage statistics table
CREATE TABLE template_usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES ticket_templates(id) ON DELETE CASCADE,
    event_id UUID,
    usage_date DATE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, event_id, usage_date)
);

-- QR code cache table
CREATE TABLE qr_code_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    qr_code_data TEXT NOT NULL,
    qr_code_image_url VARCHAR(500),
    signature VARCHAR(255),
    nonce VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id)
);

-- Create indexes
CREATE INDEX idx_tickets_ticket_code ON tickets(ticket_code);
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_event_guest_id ON tickets(event_guest_id);
CREATE INDEX idx_tickets_type ON tickets(ticket_type);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_is_validated ON tickets(is_validated);
CREATE INDEX idx_tickets_generation_job_id ON tickets(generation_job_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

CREATE INDEX idx_ticket_types_event_id ON ticket_types(event_id);
CREATE INDEX idx_ticket_types_type ON ticket_types(type);
CREATE INDEX idx_ticket_types_active ON ticket_types(is_active);
CREATE INDEX idx_ticket_types_available_dates ON ticket_types(available_from, available_to);

CREATE INDEX idx_ticket_templates_type ON ticket_templates(type);
CREATE INDEX idx_ticket_templates_active ON ticket_templates(is_active);
CREATE INDEX idx_ticket_templates_customizable ON ticket_templates(is_customizable);

CREATE INDEX idx_ticket_generation_jobs_event_id ON ticket_generation_jobs(event_id);
CREATE INDEX idx_ticket_generation_jobs_status ON ticket_generation_jobs(status);
CREATE INDEX idx_ticket_generation_jobs_created_at ON ticket_generation_jobs(created_at);
CREATE INDEX idx_ticket_generation_jobs_template_id ON ticket_generation_jobs(template_id);

CREATE INDEX idx_ticket_generation_queue_name ON ticket_generation_queue(name);
CREATE INDEX idx_ticket_generation_queue_timestamp ON ticket_generation_queue(timestamp);
CREATE INDEX idx_ticket_generation_queue_progress ON ticket_generation_queue(progress);

CREATE INDEX idx_ticket_pdfs_ticket_id ON ticket_pdfs(ticket_id);
CREATE INDEX idx_ticket_pdfs_file_path ON ticket_pdfs(file_path);
CREATE INDEX idx_ticket_pdfs_expires_at ON ticket_pdfs(expires_at);

CREATE INDEX idx_batch_generation_requests_event_id ON batch_generation_requests(event_id);
CREATE INDEX idx_batch_generation_requests_job_id ON batch_generation_requests(job_id);
CREATE INDEX idx_batch_generation_requests_status ON batch_generation_requests(status);

CREATE INDEX idx_template_usage_stats_template_id ON template_usage_stats(template_id);
CREATE INDEX idx_template_usage_stats_event_id ON template_usage_stats(event_id);
CREATE INDEX idx_template_usage_stats_usage_date ON template_usage_stats(usage_date);

CREATE INDEX idx_qr_code_cache_ticket_id ON qr_code_cache(ticket_id);
CREATE INDEX idx_qr_code_cache_expires_at ON qr_code_cache(expires_at);
CREATE INDEX idx_qr_code_cache_is_used ON qr_code_cache(is_used);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_types_updated_at BEFORE UPDATE ON ticket_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_templates_updated_at BEFORE UPDATE ON ticket_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_generation_jobs_updated_at BEFORE UPDATE ON ticket_generation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_generation_requests_updated_at BEFORE UPDATE ON batch_generation_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default ticket templates
INSERT INTO ticket_templates (name, description, type, template_data, is_active) VALUES
('Standard Ticket', 'Standard event ticket template', 'standard', '{"backgroundColor": "#ffffff", "textColor": "#000000", "logo": true, "qrCode": true}', true),
('VIP Ticket', 'VIP event ticket template', 'vip', '{"backgroundColor": "#gold", "textColor": "#000000", "logo": true, "qrCode": true, "vipBadge": true}', true),
('Early Bird Ticket', 'Early bird special ticket template', 'early_bird', '{"backgroundColor": "#90EE90", "textColor": "#000000", "logo": true, "qrCode": true, "earlyBirdBadge": true}', true),
('Custom Ticket', 'Customizable ticket template', 'custom', '{"backgroundColor": "#ffffff", "textColor": "#000000", "logo": true, "qrCode": true, "customizable": true}', true);

-- Create view for ticket statistics
CREATE VIEW ticket_statistics AS
SELECT 
    t.event_id,
    t.ticket_type,
    t.status,
    COUNT(*) as count,
    SUM(t.price) as total_revenue,
    AVG(t.price) as avg_price,
    DATE_TRUNC('day', t.created_at) as date
FROM tickets t
GROUP BY t.event_id, t.ticket_type, t.status, DATE_TRUNC('day', t.created_at)
ORDER BY date DESC, ticket_type, status;

-- Create view for generation job statistics
CREATE VIEW generation_job_stats AS
SELECT 
    tgj.event_id,
    tgj.status,
    COUNT(*) as job_count,
    SUM(tgj.total_tickets) as total_tickets_requested,
    SUM(tgj.generated_tickets) as total_tickets_generated,
    SUM(tgj.failed_tickets) as total_tickets_failed,
    CASE 
        WHEN SUM(tgj.total_tickets) > 0 THEN ROUND((SUM(tgj.generated_tickets)::FLOAT / SUM(tgj.total_tickets)) * 100, 2)
        ELSE 0
    END as success_rate,
    DATE_TRUNC('day', tgj.created_at) as date
FROM ticket_generation_jobs tgj
GROUP BY tgj.event_id, tgj.status, DATE_TRUNC('day', tgj.created_at)
ORDER BY date DESC, status;

-- Create view for template usage statistics
CREATE VIEW template_usage_summary AS
SELECT 
    tt.id as template_id,
    tt.name as template_name,
    tt.type as template_type,
    COUNT(t.id) as usage_count,
    COUNT(DISTINCT t.event_id) as events_used,
    SUM(t.price) as total_revenue,
    AVG(t.price) as avg_ticket_price
FROM ticket_templates tt
LEFT JOIN tickets t ON tt.id = t.template_id
GROUP BY tt.id, tt.name, tt.type
ORDER BY usage_count DESC;

-- Create function to generate unique ticket codes
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    attempts INTEGER := 0;
    max_attempts INTEGER := 10;
BEGIN
    WHILE attempts < max_attempts LOOP
        code := 'TKT-' || UPPER(substring(md5(random()::text || clock_timestamp()::text), 1, 12));
        
        IF NOT EXISTS (SELECT 1 FROM tickets WHERE ticket_code = code) THEN
            RETURN code;
        END IF;
        
        attempts := attempts + 1;
    END LOOP;
    
    RAISE EXCEPTION 'Failed to generate unique ticket code after % attempts', max_attempts;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate ticket codes
CREATE OR REPLACE FUNCTION set_ticket_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_code IS NULL OR NEW.ticket_code = '' THEN
        NEW.ticket_code := generate_ticket_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_set_code BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION set_ticket_code();

-- Create function to update generation job progress
CREATE OR REPLACE FUNCTION update_generation_job_progress()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ticket_generation_jobs 
    SET 
        generated_tickets = (
            SELECT COUNT(*) 
            FROM tickets 
            WHERE generation_job_id = NEW.generation_job_id AND status = 'generated'
        ),
        failed_tickets = (
            SELECT COUNT(*) 
            FROM tickets 
            WHERE generation_job_id = NEW.generation_job_id AND status = 'cancelled'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.generation_job_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update job progress on ticket status change
CREATE TRIGGER update_job_progress_on_ticket_change
    AFTER INSERT OR UPDATE ON tickets
    FOR EACH ROW
    WHEN (NEW.generation_job_id IS NOT NULL)
    EXECUTE FUNCTION update_generation_job_progress();

-- Create function to clean up expired QR codes
CREATE OR REPLACE FUNCTION cleanup_expired_qr_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM qr_code_cache 
    WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to update template usage statistics
CREATE OR REPLACE FUNCTION update_template_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO template_usage_stats (template_id, event_id, usage_date, usage_count)
    VALUES (NEW.template_id, NEW.event_id, CURRENT_DATE, 1)
    ON CONFLICT (template_id, event_id, usage_date) DO UPDATE SET
        usage_count = template_usage_stats.usage_count + 1,
        created_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update template usage on ticket creation
CREATE TRIGGER update_template_stats_on_ticket_create
    AFTER INSERT ON tickets
    FOR EACH ROW
    WHEN (NEW.template_id IS NOT NULL)
    EXECUTE FUNCTION update_template_usage_stats();
