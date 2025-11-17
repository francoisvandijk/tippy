-- Migration: 0031_sms_events.sql
-- Phase 2: SMS Events Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.3 (Welcome SMS)

-- SMS Events table
-- Logs all SMS events (Welcome SMS, notifications, etc.)
CREATE TABLE IF NOT EXISTS sms_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient (masked/hashed per §13, §24.3)
    recipient_msisdn_hash VARCHAR(64) NOT NULL, -- SHA256 hash per §25
    recipient_msisdn_masked VARCHAR(20), -- Masked format: xxxxxx1234 per §13.3
    
    -- Related entity
    related_entity_type VARCHAR(100), -- 'guard', 'referrer', etc.
    related_entity_id UUID,
    
    -- SMS details
    sms_type VARCHAR(100) NOT NULL, -- 'welcome', 'notification', etc.
    template_id VARCHAR(255), -- SendGrid template ID per §24.3
    message_text TEXT, -- Message content (no PII)
    
    -- Provider
    provider VARCHAR(50) NOT NULL DEFAULT 'sendgrid' CHECK (provider IN ('sendgrid', 'twilio')),
    provider_message_id VARCHAR(255),
    provider_status VARCHAR(50),
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    
    -- Error tracking
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sms_events_recipient_msisdn_hash ON sms_events(recipient_msisdn_hash);
CREATE INDEX idx_sms_events_related_entity ON sms_events(related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX idx_sms_events_sms_type ON sms_events(sms_type);
CREATE INDEX idx_sms_events_status ON sms_events(status);
CREATE INDEX idx_sms_events_created_at ON sms_events(created_at DESC);
CREATE INDEX idx_sms_events_provider_message_id ON sms_events(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Comments
COMMENT ON TABLE sms_events IS 'Logs all SMS events per Ledger §4 and §24.3';
COMMENT ON COLUMN sms_events.recipient_msisdn_hash IS 'SHA256 hash of MSISDN per Ledger §25 (POPIA compliance)';
COMMENT ON COLUMN sms_events.recipient_msisdn_masked IS 'Masked MSISDN format: xxxxxx1234 per Ledger §13.3';
COMMENT ON COLUMN sms_events.template_id IS 'SendGrid template ID per Ledger §24.3';


