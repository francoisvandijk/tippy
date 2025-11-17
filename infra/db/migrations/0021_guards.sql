-- Migration: 0021_guards.sql
-- Phase 2: Guards Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §2 (Roles & Access)

-- Guards table
-- Guards are users who receive tips via QR codes
CREATE TABLE IF NOT EXISTS guards (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Display information
    display_name VARCHAR(255) NOT NULL,
    
    -- MSISDN (phone number) - unique identifier per Ledger §1.3
    msisdn VARCHAR(20) NOT NULL UNIQUE,
    msisdn_hash VARCHAR(64) NOT NULL, -- SHA256 hash per §25
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
    
    -- Financial tracking (all in ZAR cents)
    lifetime_gross_tips BIGINT NOT NULL DEFAULT 0,
    lifetime_net_tips BIGINT NOT NULL DEFAULT 0,
    lifetime_payouts BIGINT NOT NULL DEFAULT 0,
    
    -- Preferences
    language VARCHAR(10) DEFAULT 'en',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_guards_status ON guards(status);
CREATE INDEX idx_guards_msisdn_hash ON guards(msisdn_hash);
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
COMMENT ON TABLE guards IS 'Guards receive tips via QR codes per Ledger §4';
COMMENT ON COLUMN guards.msisdn IS 'MSISDN is the canonical identifier per Ledger §1.3';
COMMENT ON COLUMN guards.lifetime_gross_tips IS 'Total gross tips received in ZAR cents';
COMMENT ON COLUMN guards.lifetime_net_tips IS 'Total net tips after fees in ZAR cents';
COMMENT ON COLUMN guards.lifetime_payouts IS 'Total payouts sent in ZAR cents';


