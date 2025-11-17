-- Migration: 0003_qr_codes.sql
-- Core Database Schema: QR Codes
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §6.4, §24.5

-- QR codes table
-- QR code assignments to guards
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- QR identification
    code VARCHAR(255) NOT NULL UNIQUE, -- Full QR code value/URL
    short_code VARCHAR(20) UNIQUE, -- Base32/62 short code (8-10 chars) per §4
    batch_id UUID, -- Will reference qr_batches table (added in later migration)
    
    -- Assignment
    assigned_guard_id UUID REFERENCES guards(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'active', 'replaced', 'lost', 'revoked')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_qr_codes_code ON qr_codes(code);
CREATE INDEX idx_qr_codes_short_code ON qr_codes(short_code) WHERE short_code IS NOT NULL;
CREATE INDEX idx_qr_codes_assigned_guard_id ON qr_codes(assigned_guard_id) WHERE assigned_guard_id IS NOT NULL;
CREATE INDEX idx_qr_codes_status ON qr_codes(status);
CREATE INDEX idx_qr_codes_batch_id ON qr_codes(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_qr_codes_guard_status ON qr_codes(assigned_guard_id, status) WHERE assigned_guard_id IS NOT NULL;

-- Comments
COMMENT ON TABLE qr_codes IS 'QR code assignments to guards per Ledger §4';
COMMENT ON COLUMN qr_codes.code IS 'Full QR code value/URL';
COMMENT ON COLUMN qr_codes.short_code IS 'Short code (Base32/62, 8-10 chars) per Ledger §4';
COMMENT ON COLUMN qr_codes.assigned_guard_id IS 'Currently assigned guard (NULL if unassigned)';
COMMENT ON COLUMN qr_codes.status IS 'QR code status: unassigned, assigned, active, replaced, lost, or revoked';

