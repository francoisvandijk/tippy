-- Migration: 0007_referrals.sql
-- Core Database Schema: Referrals
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10, §24.4

-- Referrals table
-- Links referrer → referred guard (unique by MSISDN, immutable after 7 days per §4)
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referrer
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    
    -- Referred guard
    referred_guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
    referred_guard_msisdn VARCHAR(20) NOT NULL, -- Denormalized for uniqueness check
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'milestone_reached', 'completed', 'cancelled')),
    
    -- Milestone tracking
    milestone_reached_at TIMESTAMPTZ, -- When guard reached R500 gross
    milestone_amount BIGINT, -- Amount at milestone (R500 in cents)
    
    -- Immutability window
    immutable_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'), -- Per §4: immutable after 7 days
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB,
    audit_log JSONB
);

-- Unique constraint: one referral per MSISDN per referrer (per §4 and §24.4.5)
CREATE UNIQUE INDEX idx_referrals_referrer_msisdn ON referrals(referrer_id, referred_guard_msisdn);

-- Indexes
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_guard_id ON referrals(referred_guard_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_created_at ON referrals(created_at DESC);
CREATE INDEX idx_referrals_milestone ON referrals(milestone_reached_at) WHERE milestone_reached_at IS NOT NULL;

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
COMMENT ON TABLE referrals IS 'Referral relationships per Ledger §4 and §10';
COMMENT ON COLUMN referrals.referred_guard_msisdn IS 'MSISDN of referred guard (for uniqueness check)';
COMMENT ON COLUMN referrals.immutable_after IS 'Referral becomes immutable after 7 days per Ledger §4';
COMMENT ON COLUMN referrals.milestone_reached_at IS 'When guard reached R500 lifetime gross per Ledger §10.2';

