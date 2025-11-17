-- Migration: 0035_guard_registration_events.sql
-- Phase 2: Guard Registration Events Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.4 (Guard Registration)

-- Guard Registration Events table
-- Logs all guard registration events (manual, admin, via referrer)
CREATE TABLE IF NOT EXISTS guard_registration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    guard_id UUID REFERENCES guards(id) ON DELETE SET NULL,
    registered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin or referrer who registered
    referrer_id UUID REFERENCES referrers(id) ON DELETE SET NULL, -- If registered via referrer
    
    -- Registration method
    registration_method VARCHAR(50) NOT NULL CHECK (registration_method IN ('manual', 'admin', 'referrer', 'self')),
    
    -- Registration details
    guard_msisdn_hash VARCHAR(64) NOT NULL, -- SHA256 hash per §25
    guard_msisdn_masked VARCHAR(20), -- Masked format: xxxxxx1234 per §13.3
    guard_display_name VARCHAR(255),
    
    -- QR code assignment
    qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
    
    -- Anti-abuse tracking
    device_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'rejected')),
    
    -- Error tracking
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_guard_registration_events_guard_id ON guard_registration_events(guard_id) WHERE guard_id IS NOT NULL;
CREATE INDEX idx_guard_registration_events_registered_by_user_id ON guard_registration_events(registered_by_user_id) WHERE registered_by_user_id IS NOT NULL;
CREATE INDEX idx_guard_registration_events_referrer_id ON guard_registration_events(referrer_id) WHERE referrer_id IS NOT NULL;
CREATE INDEX idx_guard_registration_events_registration_method ON guard_registration_events(registration_method);
CREATE INDEX idx_guard_registration_events_status ON guard_registration_events(status);
CREATE INDEX idx_guard_registration_events_created_at ON guard_registration_events(created_at DESC);
CREATE INDEX idx_guard_registration_events_ip_address ON guard_registration_events(ip_address) WHERE ip_address IS NOT NULL;

-- Comments
COMMENT ON TABLE guard_registration_events IS 'Logs all guard registration events per Ledger §4 and §24.4';
COMMENT ON COLUMN guard_registration_events.guard_msisdn_hash IS 'SHA256 hash of MSISDN per Ledger §25 (POPIA compliance)';
COMMENT ON COLUMN guard_registration_events.guard_msisdn_masked IS 'Masked MSISDN format: xxxxxx1234 per Ledger §13.3';


