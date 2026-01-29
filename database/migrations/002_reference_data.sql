-- ========================================
-- MIGRATION 002: DONNÉES RÉFÉRENCE & VALIDATION
-- ========================================
-- Gère les références externes et données système
-- Version IDEMPOTENTE - Généré le 2026-01-26

-- ========================================
-- Vue pour valider les références externes (IDEMPOTENT)
-- ========================================
CREATE OR REPLACE VIEW external_references_validation AS
SELECT 
    'ticket_generation_logs' as table_name,
    'job_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN job_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN job_id IS NULL THEN 1 END) as null_reference
FROM ticket_generation_logs

UNION ALL

SELECT 
    'generated_tickets' as table_name,
    'job_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN job_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN job_id IS NULL THEN 1 END) as null_reference
FROM generated_tickets

UNION ALL

SELECT 
    'generated_tickets' as table_name,
    'event_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN event_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN event_id IS NULL THEN 1 END) as null_reference
FROM generated_tickets

UNION ALL

SELECT 
    'generated_tickets' as table_name,
    'template_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN template_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN template_id IS NULL THEN 1 END) as null_reference
FROM generated_tickets

UNION ALL

SELECT 
    'generated_tickets' as table_name,
    'guest_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN guest_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN guest_id IS NULL THEN 1 END) as null_reference
FROM generated_tickets;

-- ========================================
-- Fonction pour valider l'intégrité des références (IDEMPOTENT)
-- ========================================
CREATE OR REPLACE FUNCTION validate_external_references()
RETURNS TABLE(
    table_name TEXT,
    column_name TEXT,
    total_records BIGINT,
    with_reference BIGINT,
    null_reference BIGINT,
    integrity_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        erv.table_name,
        erv.column_name,
        erv.total_records,
        erv.with_reference,
        erv.null_reference,
        CASE 
            WHEN erv.total_records = 0 THEN 'EMPTY_TABLE'
            WHEN erv.null_reference = 0 THEN 'ALL_REFERENCED'
            WHEN erv.with_reference > 0 THEN 'PARTIAL_REFERENCES'
            ELSE 'NO_REFERENCES'
        END as integrity_status
    FROM external_references_validation erv;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Configuration système par défaut (IDEMPOTENT)
-- ========================================
-- Créer une table de configuration pour les paramètres du service
CREATE TABLE IF NOT EXISTS service_config (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

-- Insérer les configurations par défaut
INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'default_ticket_template',
    '{"name": "Standard", "format": "pdf", "qr_enabled": true}',
    'Template de ticket par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'default_ticket_template'
);

INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'qr_code_settings',
    '{"error_correction": "M", "size": 200, "margin": 4}',
    'Paramètres QR code par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'qr_code_settings'
);

INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'pdf_settings',
    '{"format": "A4", "orientation": "portrait", "dpi": 300}',
    'Paramètres PDF par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'pdf_settings'
);

-- ========================================
-- Rapport d'intégrité (IDEMPOTENT)
-- ========================================
DO $$
DECLARE
    validation_record RECORD;
    total_issues INTEGER := 0;
    config_count INTEGER;
BEGIN
    -- Compter les configurations
    SELECT COUNT(*) INTO config_count 
    FROM service_config;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VALIDATION RÉFÉRENCES EXTERNES - ticket-generator-service';
    RAISE NOTICE '══════════════════════════════════════════════════';
    RAISE NOTICE '📊 Analyse des références externes...';
    
    FOR validation_record IN SELECT * FROM validate_external_references() LOOP
        RAISE NOTICE '';
        RAISE NOTICE '📋 Table: %.%', validation_record.table_name, validation_record.column_name;
        RAISE NOTICE '   Total enregistrements: %', validation_record.total_records;
        RAISE NOTICE '   Avec référence: %', validation_record.with_reference;
        RAISE NOTICE '   Sans référence: %', validation_record.null_reference;
        RAISE NOTICE '   Statut intégrité: %', validation_record.integrity_status;
        
        IF validation_record.integrity_status IN ('PARTIAL_REFERENCES', 'NO_REFERENCES') 
           AND validation_record.total_records > 0 THEN
            total_issues := total_issues + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '⚙️  Configurations système: %', config_count;
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RÉSUMÉ VALIDATION';
    RAISE NOTICE '══════════════════════════════════════════════════';
    
    IF total_issues = 0 AND config_count >= 3 THEN
        RAISE NOTICE '✅ SUCCÈS : Service prêt à fonctionner';
        RAISE NOTICE '🔗 Références externes valides';
        RAISE NOTICE '⚙️  Configurations système initialisées';
    ELSE
        RAISE NOTICE '⚠️  ATTENTION : % problème(s) détecté(s)', total_issues;
        RAISE NOTICE '💡 Solution: Assurez-vous que les entités référencées existent';
        RAISE NOTICE '🔧 Les enregistrements avec références NULL seront ignorés';
    END IF;
    
    RAISE NOTICE '══════════════════════════════════════════════════';
END $$;
