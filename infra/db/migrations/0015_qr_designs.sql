-- Migration: 0015_qr_designs.sql
-- Core Database Schema: QR Designs
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §24.5

-- QR designs table
-- QR card design templates per Ledger §24.5
CREATE TABLE IF NOT EXISTS qr_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Design identification
    design_name VARCHAR(255) NOT NULL,
    design_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    
    -- Design specifications (per §24.5.2)
    card_size VARCHAR(50) NOT NULL DEFAULT 'CR80' CHECK (card_size IN ('CR80', 'A4', 'custom')), -- CR80 = 85.60 × 53.98 mm
    bleed_mm NUMERIC(5,2) NOT NULL DEFAULT 3.0, -- 3mm bleed per §24.5.2
    safe_area_mm NUMERIC(5,2) NOT NULL DEFAULT 3.0, -- 3mm safe area per §24.5.2
    dpi INTEGER NOT NULL DEFAULT 300, -- 300 DPI minimum per §24.5.2
    color_mode VARCHAR(10) NOT NULL DEFAULT 'CMYK' CHECK (color_mode IN ('CMYK', 'RGB')),
    
    -- QR code specifications
    qr_size_mm NUMERIC(5,2) NOT NULL DEFAULT 25.0, -- Minimum 25mm per §24.5.2
    qr_ecc_level VARCHAR(1) NOT NULL DEFAULT 'H' CHECK (qr_ecc_level IN ('L', 'M', 'Q', 'H')), -- ECC level H per §24.5.2
    qr_quiet_zone_mm NUMERIC(5,2) NOT NULL DEFAULT 4.0, -- ≥4 modules per §24.5.2
    
    -- Design assets
    template_file_path TEXT, -- Path to design template file
    logo_file_path TEXT, -- Logo file path
    background_file_path TEXT, -- Background image path
    
    -- Branding
    brand_colors JSONB, -- Color palette
    font_family VARCHAR(100),
    font_sizes JSONB, -- Font size specifications
    
    -- Created by
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_qr_designs_is_active ON qr_designs(is_active);
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

-- Insert default design
INSERT INTO qr_designs (design_name, design_version, is_active, is_default, card_size, qr_size_mm, qr_ecc_level, qr_quiet_zone_mm, dpi, color_mode)
VALUES ('Default Tippy QR Card', '1.0', true, true, 'CR80', 25.0, 'H', 4.0, 300, 'CMYK')
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE qr_designs IS 'QR card design templates per Ledger §24.5';
COMMENT ON COLUMN qr_designs.card_size IS 'Card size: CR80 (85.60 × 53.98 mm) per Ledger §24.5.2';
COMMENT ON COLUMN qr_designs.qr_ecc_level IS 'QR ECC level: H (high) per Ledger §24.5.2';
COMMENT ON COLUMN qr_designs.qr_size_mm IS 'QR code minimum size: 25mm per Ledger §24.5.2';

