-- Migration: 0030_audit_log.sql
-- Phase 2: Audit Log Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §13 (POPIA & Security)

-- Audit Log table
-- Immutable audit trail for all sensitive events
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Actor (who performed the action)
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(50),
    actor_ip_address INET,
    
    -- Action details
    action_type VARCHAR(100) NOT NULL, -- e.g., 'payment_created', 'guard_registered', 'payout_generated'
    entity_type VARCHAR(100), -- e.g., 'payment', 'guard', 'referral'
    entity_id UUID,
    
    -- Event data (JSONB, no PII per §13)
    event_data JSONB,
    
    -- Result
    result VARCHAR(50) NOT NULL CHECK (result IN ('success', 'failure', 'error')),
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_log_actor_user_id ON audit_log(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX idx_audit_log_entity_type ON audit_log(entity_type) WHERE entity_type IS NOT NULL;
CREATE INDEX idx_audit_log_entity_id ON audit_log(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_result ON audit_log(result);

-- Comments
COMMENT ON TABLE audit_log IS 'Immutable audit trail for sensitive events per Ledger §4 and §13';
COMMENT ON COLUMN audit_log.event_data IS 'Event data in JSONB format (no PII per Ledger §13)';
COMMENT ON COLUMN audit_log.created_at IS 'Immutable timestamp - records cannot be updated or deleted';


