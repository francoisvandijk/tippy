-- Migration: 0036_abuse_flags.sql
-- Phase 2: Abuse Flags Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.5 (Anti-Abuse), §24.4.5 (Anti-Abuse Controls)

-- Abuse Flags table
-- Tracks potential abuse patterns for admin review
CREATE TABLE IF NOT EXISTS abuse_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Related entities
    guard_id UUID REFERENCES guards(id) ON DELETE SET NULL,
    referrer_id UUID REFERENCES referrers(id) ON DELETE SET NULL,
    referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
    registration_event_id UUID REFERENCES guard_registration_events(id) ON DELETE SET NULL,
    
    -- Flag type
    flag_type VARCHAR(100) NOT NULL, -- e.g., 'duplicate_msisdn', 'excessive_registrations', 'suspicious_pattern'
    severity VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Flag details
    flag_reason TEXT NOT NULL,
    flag_data JSONB, -- Additional context data
    
    -- Detection source
    detection_method VARCHAR(100), -- e.g., 'heuristic', 'rule_based', 'manual'
    detection_rule_id VARCHAR(255), -- Reference to detection rule
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'false_positive', 'escalated')),
    
    -- Resolution
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_abuse_flags_guard_id ON abuse_flags(guard_id) WHERE guard_id IS NOT NULL;
CREATE INDEX idx_abuse_flags_referrer_id ON abuse_flags(referrer_id) WHERE referrer_id IS NOT NULL;
CREATE INDEX idx_abuse_flags_flag_type ON abuse_flags(flag_type);
CREATE INDEX idx_abuse_flags_severity ON abuse_flags(severity);
CREATE INDEX idx_abuse_flags_status ON abuse_flags(status);
CREATE INDEX idx_abuse_flags_created_at ON abuse_flags(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_abuse_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER abuse_flags_updated_at
    BEFORE UPDATE ON abuse_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_abuse_flags_updated_at();

-- Comments
COMMENT ON TABLE abuse_flags IS 'Tracks potential abuse patterns for admin review per Ledger §4, §10.5, and §24.4.5';
COMMENT ON COLUMN abuse_flags.flag_type IS 'Type of abuse flag (duplicate_msisdn, excessive_registrations, etc.)';
COMMENT ON COLUMN abuse_flags.detection_method IS 'How the flag was detected (heuristic, rule_based, manual)';


