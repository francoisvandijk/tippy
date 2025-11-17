-- Migration: 0009_referral_earnings_ledger.sql
-- Core Database Schema: Referral Earnings Ledger
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.3, §10.4

-- Referral earnings ledger table
-- Immutable event log for EARNED / REVERSAL per §4 and §10.4
CREATE TABLE IF NOT EXISTS referral_earnings_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referrer
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    
    -- Referral linkage
    referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
    milestone_id UUID REFERENCES referral_milestones(id) ON DELETE SET NULL,
    
    -- Event type
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('EARNED', 'REVERSAL')), -- Per §4
    amount BIGINT NOT NULL CHECK (amount > 0), -- In ZAR cents (positive for EARNED, positive for REVERSAL but will be subtracted)
    
    -- Reversal tracking (T+30 reversal logic per §10.2)
    reversal_reason TEXT, -- Reason for reversal (e.g., chargeback, T+30)
    original_earned_at TIMESTAMPTZ, -- When original EARNED event occurred (for T+30 calculation)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed', 'paid')),
    
    -- Payout linkage
    payout_batch_item_id UUID REFERENCES payout_batch_items(id) ON DELETE SET NULL,
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata (immutable)
    metadata JSONB,
    audit_log JSONB
);

-- Indexes
CREATE INDEX idx_referral_earnings_ledger_referrer_id ON referral_earnings_ledger(referrer_id);
CREATE INDEX idx_referral_earnings_ledger_event_type ON referral_earnings_ledger(event_type);
CREATE INDEX idx_referral_earnings_ledger_status ON referral_earnings_ledger(status);
CREATE INDEX idx_referral_earnings_ledger_created_at ON referral_earnings_ledger(created_at DESC);
CREATE INDEX idx_referral_earnings_ledger_referral_id ON referral_earnings_ledger(referral_id) WHERE referral_id IS NOT NULL;

-- Comments
COMMENT ON TABLE referral_earnings_ledger IS 'Immutable referral earnings event log per Ledger §4 and §10.4';
COMMENT ON COLUMN referral_earnings_ledger.event_type IS 'Event type: EARNED or REVERSAL per Ledger §4';
COMMENT ON COLUMN referral_earnings_ledger.original_earned_at IS 'Original EARNED timestamp for T+30 reversal calculation per Ledger §10.2';

