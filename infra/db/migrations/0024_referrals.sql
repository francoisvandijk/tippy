-- Migration: 0024_referrals.sql
-- Phase 2: Referrals Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10 (Referrals)

-- Referrals table
-- Links referrer to referred guard (unique by MSISDN, immutable after 7 days)
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    referred_guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
    
    -- MSISDN of referred guard (for uniqueness check per Ledger §10)
    referred_guard_msisdn VARCHAR(20) NOT NULL,
    referred_guard_msisdn_hash VARCHAR(64) NOT NULL, -- SHA256 hash per §25
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'milestone_reached', 'reversed')),
    
    -- Immutability window (7 days per Ledger §10)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    immutable_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    
    -- Timestamps
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    milestone_reached_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ
);

-- Unique constraint: one referral per MSISDN per referrer
CREATE UNIQUE INDEX idx_referrals_unique_msisdn ON referrals(referrer_id, referred_guard_msisdn_hash);

-- Indexes
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_guard_id ON referrals(referred_guard_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_created_at ON referrals(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_referrals_updated_at();

-- Comments
COMMENT ON TABLE referrals IS 'Links referrer to referred guard per Ledger §4 and §10';
COMMENT ON COLUMN referrals.immutable_after IS 'Referral becomes immutable after 7 days per Ledger §10';
COMMENT ON COLUMN referrals.referred_guard_msisdn_hash IS 'MSISDN hash for uniqueness check per Ledger §10';


