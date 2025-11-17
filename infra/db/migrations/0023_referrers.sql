-- Migration: 0023_referrers.sql
-- Phase 2: Referrers Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10 (Referrals)

-- Referrers table
-- Referrers can refer guards and earn rewards
CREATE TABLE IF NOT EXISTS referrers (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role (should be 'referrer' or 'guard' per Ledger §2.2)
    role VARCHAR(50) NOT NULL CHECK (role IN ('referrer', 'guard')),
    
    -- Display information
    display_name VARCHAR(255) NOT NULL,
    
    -- MSISDN (phone number) - unique identifier
    msisdn VARCHAR(20) NOT NULL UNIQUE,
    msisdn_hash VARCHAR(64) NOT NULL, -- SHA256 hash per §25
    
    -- Status
    active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_referrers_active ON referrers(active);
CREATE INDEX idx_referrers_msisdn_hash ON referrers(msisdn_hash);
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
COMMENT ON TABLE referrers IS 'Referrers can refer guards and earn rewards per Ledger §4 and §10';
COMMENT ON COLUMN referrers.role IS 'Referrer role (guard or referrer can be referrers per Ledger §2.2)';


