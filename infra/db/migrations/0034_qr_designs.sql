-- Migration: 0034_qr_designs.sql
-- Phase 2: QR Designs Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.5 (Bulk QR Generation)

-- QR Designs table
-- Design templates for QR code cards
CREATE TABLE IF NOT EXISTS qr_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Design identification
    design_name VARCHAR(255) NOT NULL,
    design_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    
    -- Design type
    design_type VARCHAR(50) NOT NULL CHECK (design_type IN ('guard', 'referrer')),
    
    -- Design specifications (per Ledger §24.5)
    card_size VARCHAR(50) NOT NULL DEFAULT 'CR80' CHECK (card_size IN ('CR80', 'A4')),
    card_width_mm NUMERIC(10, 2) DEFAULT 85.60, -- CR80 width
    card_height_mm NUMERIC(10, 2) DEFAULT 53.98, -- CR80 height
    bleed_mm NUMERIC(10, 2) DEFAULT 3.00,
    safe_area_mm NUMERIC(10, 2) DEFAULT 3.00,
    qr_size_mm NUMERIC(10, 2) DEFAULT 25.00, -- Minimum QR size
    qr_ecc_level VARCHAR(10) DEFAULT 'H', -- Error correction level
    color_mode VARCHAR(10) DEFAULT 'CMYK',
    dpi INTEGER DEFAULT 300,
    
    -- Design assets
    template_file_url TEXT, -- URL to template file
    logo_url TEXT,
    background_url TEXT,
    
    -- Design data (JSONB for flexible design config)
    design_data JSONB,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_qr_designs_design_type ON qr_designs(design_type);
CREATE INDEX idx_qr_designs_status ON qr_designs(status);
CREATE INDEX idx_qr_designs_is_default ON qr_designs(is_default);
CREATE INDEX idx_qr_designs_created_at ON qr_designs(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qr_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER qr_designs_updated_at
    BEFORE UPDATE ON qr_designs
    FOR EACH ROW
    EXECUTE FUNCTION update_qr_designs_updated_at();

-- Comments
COMMENT ON TABLE qr_designs IS 'Design templates for QR code cards per Ledger §4 and §24.5';
COMMENT ON COLUMN qr_designs.card_size IS 'CR80 (85.60 × 53.98 mm) per Ledger §24.5';
COMMENT ON COLUMN qr_designs.qr_ecc_level IS 'ECC level H per Ledger §24.5';


