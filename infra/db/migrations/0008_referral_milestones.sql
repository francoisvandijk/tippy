-- Migration: 0008_referral_milestones.sql
-- Core Database Schema: Referral Milestones
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.2

-- Referral milestones table
-- Tracks when referred guards reach R500 lifetime gross (triggers R20 reward per §10.2)
CREATE TABLE IF NOT EXISTS referral_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referral linkage
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT,
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
    
    -- Milestone details
    milestone_type VARCHAR(50) NOT NULL DEFAULT 'R500_GROSS' CHECK (milestone_type = 'R500_GROSS'), -- Per §10.2
    milestone_amount BIGINT NOT NULL CHECK (milestone_amount >= 50000), -- R500 in cents
    guard_lifetime_gross_at_milestone BIGINT NOT NULL CHECK (guard_lifetime_gross_at_milestone >= 50000), -- In ZAR cents
    
    -- Reward
    reward_amount BIGINT NOT NULL DEFAULT 2000 CHECK (reward_amount = 2000), -- R20 in cents per §10.2
    reward_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (reward_status IN ('pending', 'earned', 'paid', 'reversed')),
    
    -- Timestamps
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    earned_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_referral_milestones_referral_id ON referral_milestones(referral_id);
CREATE INDEX idx_referral_milestones_referrer_id ON referral_milestones(referrer_id);
CREATE INDEX idx_referral_milestones_guard_id ON referral_milestones(guard_id);
CREATE INDEX idx_referral_milestones_reward_status ON referral_milestones(reward_status);
CREATE INDEX idx_referral_milestones_triggered_at ON referral_milestones(triggered_at DESC);

-- Comments
COMMENT ON TABLE referral_milestones IS 'Referral milestone tracking per Ledger §4 and §10.2';
COMMENT ON COLUMN referral_milestones.milestone_amount IS 'Milestone threshold: R500 (50000 cents) per Ledger §10.2';
COMMENT ON COLUMN referral_milestones.reward_amount IS 'Reward amount: R20 (2000 cents) per Ledger §10.2';

