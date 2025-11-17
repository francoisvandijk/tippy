-- Migration: 0011_audit_log.sql
-- Core Database Schema: Audit Log
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §25

-- Audit log table
-- Immutable system event log for all sensitive events per Ledger §4 and §25
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL, -- e.g., 'guard_registered', 'payout_generated', 'referral_created'
    event_category VARCHAR(50) NOT NULL CHECK (event_category IN ('registration', 'payment', 'payout', 'referral', 'admin', 'security', 'other')),
    
    -- Actor (who performed the action)
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(50), -- 'admin', 'guard', 'referrer', etc.
    actor_ip_address INET,
    actor_user_agent TEXT,
    
    -- Entity (what was affected)
    entity_type VARCHAR(50), -- 'guard', 'payment', 'referral', etc.
    entity_id UUID, -- ID of affected entity
    
    -- Event details
    action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'approve', etc.
    description TEXT, -- Human-readable description
    changes JSONB, -- Before/after state (if applicable)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'partial')),
    error_message TEXT, -- If status is 'failure'
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata (immutable)
    metadata JSONB,
    request_id VARCHAR(255), -- For tracing requests
    session_id VARCHAR(255) -- For tracing sessions
);

-- Indexes
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_event_category ON audit_log(event_category);
CREATE INDEX idx_audit_log_actor_user_id ON audit_log(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_request_id ON audit_log(request_id) WHERE request_id IS NOT NULL;

-- Comments
COMMENT ON TABLE audit_log IS 'Immutable system audit log per Ledger §4 and §25';
COMMENT ON COLUMN audit_log.created_at IS 'Immutable timestamp - never updated';
COMMENT ON COLUMN audit_log.changes IS 'Before/after state changes (JSONB)';

