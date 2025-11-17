-- Migration: 0013_guard_registration_events.sql
-- Core Database Schema: Guard Registration Events
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.4.6

-- Guard registration events table
-- Immutable record of guard registrations per Ledger §24.4.6
CREATE TABLE IF NOT EXISTS guard_registration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Guard
    guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
    guard_msisdn VARCHAR(20) NOT NULL, -- Denormalized for audit
    
    -- Registration method
    registration_method VARCHAR(50) NOT NULL CHECK (registration_method IN ('manual', 'admin', 'referrer', 'self', 'assisted')),
    
    -- Referrer (if applicable)
    referrer_id UUID REFERENCES referrers(id) ON DELETE SET NULL,
    referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
    
    -- Actor (who performed registration)
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(50), -- 'admin', 'referrer', 'guard', etc.
    
    -- QR code assignment
    qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
    qr_code_assigned BOOLEAN NOT NULL DEFAULT false,
    
    -- Anti-abuse tracking (per §24.4.5)
    device_id VARCHAR(255), -- Device identifier
    ip_address INET,
    user_agent TEXT,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    
    -- Welcome SMS
    welcome_sms_sent BOOLEAN NOT NULL DEFAULT false,
    welcome_sms_event_id UUID REFERENCES sms_events(id) ON DELETE SET NULL,
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata (immutable)
    metadata JSONB,
    audit_log JSONB
);

-- Indexes
CREATE INDEX idx_guard_registration_events_guard_id ON guard_registration_events(guard_id);
CREATE INDEX idx_guard_registration_events_referrer_id ON guard_registration_events(referrer_id) WHERE referrer_id IS NOT NULL;
CREATE INDEX idx_guard_registration_events_registration_method ON guard_registration_events(registration_method);
CREATE INDEX idx_guard_registration_events_actor_user_id ON guard_registration_events(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_guard_registration_events_created_at ON guard_registration_events(created_at DESC);
CREATE INDEX idx_guard_registration_events_ip_address ON guard_registration_events(ip_address) WHERE ip_address IS NOT NULL;

-- Comments
COMMENT ON TABLE guard_registration_events IS 'Immutable guard registration audit trail per Ledger §24.4.6';
COMMENT ON COLUMN guard_registration_events.registration_method IS 'How guard was registered: manual, admin, referrer, self, or assisted';
COMMENT ON COLUMN guard_registration_events.created_at IS 'Immutable timestamp - never updated';

