-- Migration: 0002_guards.sql
-- Core Database Schema: Guards
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §26

-- Guards table
-- Guard profiles linked to users table
CREATE TABLE IF NOT EXISTS guards (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Identity
    display_name VARCHAR(255),
    msisdn VARCHAR(20) NOT NULL UNIQUE, -- Phone number (canonical identifier per §1.3)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
    
    -- Earnings tracking
    lifetime_gross_tips BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_gross_tips >= 0), -- In ZAR cents
    lifetime_net_tips BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_net_tips >= 0), -- In ZAR cents
    lifetime_payouts BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_payouts >= 0), -- In ZAR cents
    
    -- Referral linkage
    referred_by_referrer_id UUID, -- Will reference referrers table (added in later migration)
    
    -- Preferences
    language VARCHAR(10) DEFAULT 'en', -- For SMS/notifications
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_guards_msisdn ON guards(msisdn);
CREATE INDEX idx_guards_status ON guards(status);
CREATE INDEX idx_guards_referred_by ON guards(referred_by_referrer_id) WHERE referred_by_referrer_id IS NOT NULL;
CREATE INDEX idx_guards_created_at ON guards(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_guards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER guards_updated_at
    BEFORE UPDATE ON guards
    FOR EACH ROW
    EXECUTE FUNCTION update_guards_updated_at();

-- Comments
COMMENT ON TABLE guards IS 'Guard profiles per Ledger §4';
COMMENT ON COLUMN guards.msisdn IS 'Canonical identifier per Ledger §1.3 - must be unique';
COMMENT ON COLUMN guards.lifetime_gross_tips IS 'Total gross tips received in ZAR cents';
COMMENT ON COLUMN guards.lifetime_net_tips IS 'Total net tips (after fees) in ZAR cents';
COMMENT ON COLUMN guards.lifetime_payouts IS 'Total payouts sent in ZAR cents';
COMMENT ON COLUMN guards.status IS 'Guard status: pending, active, inactive, or suspended';

