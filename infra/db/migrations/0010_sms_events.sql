-- Migration: 0010_sms_events.sql
-- Core Database Schema: SMS Events
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.3

-- SMS events table
-- Audit log for SMS sending per Ledger §24.3 (masked phone numbers per §13)
CREATE TABLE IF NOT EXISTS sms_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recipient (POPIA-compliant: masked/hashed)
    recipient_msisdn_hash VARCHAR(64), -- SHA256 hash of phone number per §13
    recipient_msisdn_masked VARCHAR(20), -- Masked format: xxxxxx1234 per §13.3
    
    -- SMS details
    template_id VARCHAR(100), -- e.g., 'tippy_guard_welcome_v1' per §24.3
    language VARCHAR(10) DEFAULT 'en', -- Language code
    message_text TEXT, -- Full message text (≤160 chars per §24.3)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced')),
    
    -- Provider details
    provider VARCHAR(50) CHECK (provider IN ('sendgrid', 'twilio')),
    provider_message_id VARCHAR(255), -- External provider message ID
    provider_response JSONB, -- Full provider response
    
    -- Retry logic (3 attempts per §24.3)
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1 AND attempt_number <= 3),
    error_message TEXT,
    
    -- Context
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('welcome_sms', 'notification', 'otp', 'other')),
    related_entity_type VARCHAR(50), -- 'guard', 'referrer', etc.
    related_entity_id UUID, -- References guards.id, referrers.id, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_sms_events_recipient_hash ON sms_events(recipient_msisdn_hash) WHERE recipient_msisdn_hash IS NOT NULL;
CREATE INDEX idx_sms_events_status ON sms_events(status);
CREATE INDEX idx_sms_events_event_type ON sms_events(event_type);
CREATE INDEX idx_sms_events_related_entity ON sms_events(related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX idx_sms_events_created_at ON sms_events(created_at DESC);
CREATE INDEX idx_sms_events_provider_message_id ON sms_events(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Comments
COMMENT ON TABLE sms_events IS 'SMS sending audit log per Ledger §24.3';
COMMENT ON COLUMN sms_events.recipient_msisdn_hash IS 'SHA256 hash of phone number per Ledger §13 (POPIA-compliant)';
COMMENT ON COLUMN sms_events.recipient_msisdn_masked IS 'Masked phone number format: xxxxxx1234 per Ledger §13.3';
COMMENT ON COLUMN sms_events.template_id IS 'SMS template ID (e.g., tippy_guard_welcome_v1) per Ledger §24.3';
COMMENT ON COLUMN sms_events.attempt_number IS 'Retry attempt (max 3 per Ledger §24.3)';

