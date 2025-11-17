-- Migration: 0022_qr_codes.sql
-- Phase 2: QR Codes Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §6.4 (QR Assignment)

-- QR Codes table
-- QR codes are assigned to guards for tip collection
CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- QR code identifier
    code VARCHAR(255) NOT NULL UNIQUE, -- Full QR code value
    short_code VARCHAR(20), -- Base32/62 short code (8-10 chars) per Ledger §24.5
    
    -- Assignment
    assigned_guard_id UUID REFERENCES guards(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'active', 'replaced', 'lost', 'inactive')),
    
    -- Batch information (for bulk generation per §24.5)
    batch_id UUID, -- Will reference qr_batches table
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_qr_codes_code ON qr_codes(code);
CREATE INDEX idx_qr_codes_short_code ON qr_codes(short_code) WHERE short_code IS NOT NULL;
CREATE INDEX idx_qr_codes_assigned_guard_id ON qr_codes(assigned_guard_id) WHERE assigned_guard_id IS NOT NULL;
CREATE INDEX idx_qr_codes_status ON qr_codes(status);
CREATE INDEX idx_qr_codes_batch_id ON qr_codes(batch_id) WHERE batch_id IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qr_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER qr_codes_updated_at
    BEFORE UPDATE ON qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_qr_codes_updated_at();

-- Comments
COMMENT ON TABLE qr_codes IS 'QR codes for tip collection per Ledger §4 and §6.4';
COMMENT ON COLUMN qr_codes.short_code IS 'Short code for URL format: https://www.tippypay.co.za/t/<short_code> per Ledger §24.5';
COMMENT ON COLUMN qr_codes.batch_id IS 'Links to qr_batches for bulk generation per Ledger §24.5';


