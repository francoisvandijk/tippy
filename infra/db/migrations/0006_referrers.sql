-- Migration: 0006_referrers.sql
-- Core Database Schema: Referrers
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.4

-- Referrers table
-- Referrer profiles (can be guard or marketing role per §2.2)
CREATE TABLE IF NOT EXISTS referrers (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Identity
    role VARCHAR(50) NOT NULL CHECK (role IN ('guard', 'marketing')), -- Per §2.2
    display_name VARCHAR(255),
    msisdn VARCHAR(20) NOT NULL UNIQUE, -- Phone number (canonical identifier)
    
    -- Status
    active BOOLEAN NOT NULL DEFAULT false, -- Per §4: active flag
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_ADMIN' CHECK (status IN ('PENDING_ADMIN', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
    
    -- Referral tracking
    total_referrals INTEGER NOT NULL DEFAULT 0 CHECK (total_referrals >= 0),
    total_earned BIGINT NOT NULL DEFAULT 0 CHECK (total_earned >= 0), -- In ZAR cents
    total_paid_out BIGINT NOT NULL DEFAULT 0 CHECK (total_paid_out >= 0), -- In ZAR cents
    
    -- QR code for referrer
    ref_code VARCHAR(50) UNIQUE, -- Unique referral code
    ref_qr_url TEXT, -- QR code URL for referrer activation
    
    -- Activation
    activated_at TIMESTAMPTZ,
    approved_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_referrers_msisdn ON referrers(msisdn);
CREATE INDEX idx_referrers_ref_code ON referrers(ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX idx_referrers_status ON referrers(status);
CREATE INDEX idx_referrers_active ON referrers(active);
CREATE INDEX idx_referrers_role ON referrers(role);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_referrers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER referrers_updated_at
    BEFORE UPDATE ON referrers
    FOR EACH ROW
    EXECUTE FUNCTION update_referrers_updated_at();

-- Comments
COMMENT ON TABLE referrers IS 'Referrer profiles per Ledger §4 and §24.4';
COMMENT ON COLUMN referrers.role IS 'Referrer role: guard or marketing per Ledger §2.2';
COMMENT ON COLUMN referrers.status IS 'Referrer activation status per Ledger §24.4.2';
COMMENT ON COLUMN referrers.ref_code IS 'Unique referral code per Ledger §24.4.1';

