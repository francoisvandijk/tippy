-- Migration: 0014_qr_batches.sql
-- Core Database Schema: QR Batches
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.5

-- QR batches table
-- Bulk QR generation batches per Ledger §24.5
CREATE TABLE IF NOT EXISTS qr_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch identification
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    batch_name VARCHAR(255), -- Human-readable name
    
    -- Type
    batch_type VARCHAR(50) NOT NULL CHECK (batch_type IN ('guard', 'referrer', 'mixed')),
    
    -- Design
    qr_design_id UUID, -- Will reference qr_designs table (added in next migration)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'exported', 'completed', 'failed')),
    
    -- Quantities
    total_qr_codes INTEGER NOT NULL DEFAULT 0 CHECK (total_qr_codes >= 0),
    generated_qr_codes INTEGER NOT NULL DEFAULT 0 CHECK (generated_qr_codes >= 0),
    exported_qr_codes INTEGER NOT NULL DEFAULT 0 CHECK (exported_qr_codes >= 0),
    
    -- Export details
    export_format VARCHAR(50) CHECK (export_format IN ('pdf_a4', 'pdf_cr80', 'svg', 'png', 'csv', 'zip')),
    export_url TEXT, -- URL to exported file
    export_file_path TEXT, -- Server file path
    
    -- Auto-email (Tier-3 per §24.5)
    auto_email_enabled BOOLEAN NOT NULL DEFAULT false,
    email_sent_to VARCHAR(255), -- Recipient email
    email_sent_at TIMESTAMPTZ,
    
    -- Created by
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_at TIMESTAMPTZ,
    exported_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB,
    audit_log JSONB
);

-- Indexes
CREATE INDEX idx_qr_batches_batch_number ON qr_batches(batch_number);
CREATE INDEX idx_qr_batches_status ON qr_batches(status);
CREATE INDEX idx_qr_batches_batch_type ON qr_batches(batch_type);
CREATE INDEX idx_qr_batches_created_at ON qr_batches(created_at DESC);
CREATE INDEX idx_qr_batches_created_by ON qr_batches(created_by_user_id) WHERE created_by_user_id IS NOT NULL;

-- Comments
COMMENT ON TABLE qr_batches IS 'Bulk QR generation batches per Ledger §24.5';
COMMENT ON COLUMN qr_batches.batch_type IS 'Type: guard, referrer, or mixed per Ledger §24.5';
COMMENT ON COLUMN qr_batches.export_format IS 'Export format: PDF (A4/CR80), SVG, PNG, CSV, or ZIP per Ledger §24.5';

