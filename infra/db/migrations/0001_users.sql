-- Migration: 0001_users.sql
-- Core Database Schema: Users
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model)

-- Users table
-- Base identity table for all system users (admin, guard, referrer, internal)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'guard', 'referrer', 'marketing', 'user', 'internal')),
    email VARCHAR(255) UNIQUE,
    msisdn VARCHAR(20) UNIQUE, -- Phone number (will be hashed/masked per §13)
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_msisdn ON users(msisdn) WHERE msisdn IS NOT NULL;
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
COMMENT ON TABLE users IS 'Base identity table for all system users per Ledger §4';
COMMENT ON COLUMN users.role IS 'User role: admin, guard, referrer, marketing, user, or internal';
COMMENT ON COLUMN users.msisdn IS 'Phone number (MSISDN) - must be hashed/masked per Ledger §13.3';
COMMENT ON COLUMN users.is_active IS 'Whether the user account is active';

