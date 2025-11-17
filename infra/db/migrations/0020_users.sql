-- Migration: 0020_users.sql
-- Phase 2: Core Users Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §2 (Roles & Access)

-- Users table
-- Base table for all system users (guards, referrers, admins)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Role: admin, referrer, guard, internal
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'referrer', 'guard', 'internal')),
    
    -- Contact information
    email VARCHAR(255),
    msisdn VARCHAR(20), -- Phone number (will be hashed per §25)
    msisdn_hash VARCHAR(64), -- SHA256 hash of MSISDN per §25
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_msisdn_hash ON users(msisdn_hash) WHERE msisdn_hash IS NOT NULL;
CREATE INDEX idx_users_is_active ON users(is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Comments
COMMENT ON TABLE users IS 'Base table for all system users per Ledger §4';
COMMENT ON COLUMN users.role IS 'User role: admin, referrer, guard, or internal per Ledger §2';
COMMENT ON COLUMN users.msisdn_hash IS 'SHA256 hash of MSISDN per Ledger §25 (POPIA compliance)';


