-- Migration: 0026_referral_earnings_ledger.sql
-- Phase 2: Referral Earnings Ledger Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.4 (Audit & POPIA)

-- Referral Earnings Ledger table
-- Immutable event log for EARNED / REVERSAL events
CREATE TABLE IF NOT EXISTS referral_earnings_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    referrer_id UUID NOT NULL REFERENCES referrers(id) ON DELETE RESTRICT,
    referral_id UUID REFERENCES referrals(id) ON DELETE RESTRICT,
    milestone_id UUID REFERENCES referral_milestones(id) ON DELETE RESTRICT,
    
    -- Event type
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('EARNED', 'REVERSAL')),
    
    -- Amount (in ZAR cents)
    amount_zar_cents BIGINT NOT NULL,
    
    -- Balance after this event
    balance_after_zar_cents BIGINT NOT NULL,
    
    -- Reversal details (if event_type is REVERSAL)
    reversal_reason TEXT,
    reversal_reference_id UUID, -- Links to original EARNED event
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_referral_earnings_ledger_referrer_id ON referral_earnings_ledger(referrer_id);
CREATE INDEX idx_referral_earnings_ledger_referral_id ON referral_earnings_ledger(referral_id) WHERE referral_id IS NOT NULL;
CREATE INDEX idx_referral_earnings_ledger_event_type ON referral_earnings_ledger(event_type);
CREATE INDEX idx_referral_earnings_ledger_created_at ON referral_earnings_ledger(created_at DESC);
CREATE INDEX idx_referral_earnings_ledger_reversal_reference_id ON referral_earnings_ledger(reversal_reference_id) WHERE reversal_reference_id IS NOT NULL;

-- Comments
COMMENT ON TABLE referral_earnings_ledger IS 'Immutable event log for referral earnings per Ledger §4 and §10.4';
COMMENT ON COLUMN referral_earnings_ledger.event_type IS 'EARNED or REVERSAL per Ledger §10.4';
COMMENT ON COLUMN referral_earnings_ledger.reversal_reference_id IS 'Links to original EARNED event for T+30 reversal logic per Ledger §10.2';


