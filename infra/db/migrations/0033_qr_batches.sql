-- Migration: 0033_qr_batches.sql
-- Phase 2: QR Batches Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.5 (Bulk QR Generation)

-- QR Batches table
-- Tracks bulk QR code generation batches
CREATE TABLE IF NOT EXISTS qr_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch identification
    batch_name VARCHAR(255) NOT NULL,
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Batch type
    batch_type VARCHAR(50) NOT NULL CHECK (batch_type IN ('guard', 'referrer')),
    
    -- Design reference
    design_id UUID, -- Will reference qr_designs table
    
    -- Batch details
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    generated_count INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'generated', 'exported', 'failed', 'cancelled')),
    
    -- Export details (Tier-3 per Ledger §24.5)
    export_format VARCHAR(50) CHECK (export_format IN ('pdf_a4_10up', 'pdf_cr80', 'svg', 'png', 'csv', 'zip')),
    export_url TEXT,
    export_file_size_bytes BIGINT,
    email_sent_at TIMESTAMPTZ,
    vendor_delivered_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_at TIMESTAMPTZ,
    exported_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_qr_batches_batch_number ON qr_batches(batch_number);
CREATE INDEX idx_qr_batches_batch_type ON qr_batches(batch_type);
CREATE INDEX idx_qr_batches_status ON qr_batches(status);
CREATE INDEX idx_qr_batches_created_at ON qr_batches(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qr_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER qr_batches_updated_at
    BEFORE UPDATE ON qr_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_qr_batches_updated_at();

-- Comments
COMMENT ON TABLE qr_batches IS 'Tracks bulk QR code generation batches per Ledger §4 and §24.5';
COMMENT ON COLUMN qr_batches.batch_type IS 'guard or referrer QR batch type';
COMMENT ON COLUMN qr_batches.export_format IS 'Export format per Ledger §24.5 (PDF, SVG, PNG, CSV, ZIP)';


