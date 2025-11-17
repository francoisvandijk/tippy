-- Migration: 0025_referral_milestones.sql
-- Phase 2: Referral Milestones Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.2 (Milestone Logic)

-- Referral Milestones table
-- Tracks when referred guards reach R500 lifetime gross (triggers R20 reward)
CREATE TABLE IF NOT EXISTS referral_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT,
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
    
    -- Milestone details
    milestone_type VARCHAR(50) NOT NULL DEFAULT 'r500_gross' CHECK (milestone_type = 'r500_gross'),
    milestone_amount_zar_cents BIGINT NOT NULL DEFAULT 50000, -- R500 in cents
    
    -- Guard's lifetime gross at milestone
    guard_lifetime_gross_at_milestone BIGINT NOT NULL,
    
    -- Reward amount (R20 per Ledger §10.2)
    reward_amount_zar_cents BIGINT NOT NULL DEFAULT 2000, -- R20 in cents
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'reversed')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rewarded_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ
);

-- Unique constraint: one milestone per referral
CREATE UNIQUE INDEX idx_referral_milestones_unique_referral ON referral_milestones(referral_id);

-- Indexes
CREATE INDEX idx_referral_milestones_referral_id ON referral_milestones(referral_id);
CREATE INDEX idx_referral_milestones_referrer_id ON referral_milestones(referrer_id);
CREATE INDEX idx_referral_milestones_guard_id ON referral_milestones(guard_id);
CREATE INDEX idx_referral_milestones_status ON referral_milestones(status);
CREATE INDEX idx_referral_milestones_created_at ON referral_milestones(created_at DESC);

-- Comments
COMMENT ON TABLE referral_milestones IS 'Tracks R500 milestone triggers per Ledger §4 and §10.2';
COMMENT ON COLUMN referral_milestones.milestone_amount_zar_cents IS 'R500 threshold in ZAR cents per Ledger §10.2';
COMMENT ON COLUMN referral_milestones.reward_amount_zar_cents IS 'R20 reward in ZAR cents per Ledger §10.2';


