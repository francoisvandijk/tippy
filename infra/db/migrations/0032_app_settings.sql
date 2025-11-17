-- Migration: 0032_app_settings.sql
-- Phase 2: App Settings Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §3 (Config)

-- App Settings table
-- Key/value configuration store (admin-editable defaults per §3)
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Setting key (unique)
    key VARCHAR(255) NOT NULL UNIQUE,
    
    -- Setting value (stored as text, can be JSON)
    value TEXT NOT NULL,
    value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    
    -- Category for organization
    category VARCHAR(100), -- e.g., 'fees', 'payouts', 'qr', 'referrals'
    
    -- Description
    description TEXT,
    
    -- Validation
    validation_rule TEXT, -- JSON schema or regex pattern
    is_locked BOOLEAN NOT NULL DEFAULT false, -- Locked settings cannot be modified via API
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_app_settings_key ON app_settings(key);
CREATE INDEX idx_app_settings_category ON app_settings(category) WHERE category IS NOT NULL;
CREATE INDEX idx_app_settings_is_locked ON app_settings(is_locked);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_app_settings_updated_at();

-- Insert default settings per Ledger §3
INSERT INTO app_settings (key, value, value_type, category, description) VALUES
    ('PAYMENT_PROVIDER', 'Yoco', 'string', 'fees', 'Payment provider name'),
    ('YOCO_FEES_MODE', 'PercentOnly', 'string', 'fees', 'Yoco fee calculation mode'),
    ('YOCO_FEE_PERCENT', '0.00', 'number', 'fees', 'Yoco fee percentage'),
    ('YOCO_FIXED_FEE', '0.00', 'number', 'fees', 'Yoco fixed fee in ZAR'),
    ('PLATFORM_FEE_PERCENT', '10.00', 'number', 'fees', 'Platform fee percentage'),
    ('VAT_ENABLED', 'true', 'boolean', 'fees', 'VAT enabled flag'),
    ('VAT_RATE_PERCENT', '15.00', 'number', 'fees', 'VAT rate percentage'),
    ('CASH_SEND_FEE_ZAR', '9.00', 'number', 'payouts', 'CashSend fee in ZAR'),
    ('PAYOUT_MIN_ELIGIBILITY_ZAR', '500.00', 'number', 'payouts', 'Minimum payout eligibility in ZAR'),
    ('REFERRAL_FEE_PER_GUARD_ZAR', '20.00', 'number', 'referrals', 'Referral reward per guard in ZAR'),
    ('REFERRAL_TIP_THRESHOLD_ZAR', '500.00', 'number', 'referrals', 'Referral tip threshold in ZAR'),
    ('REFERRAL_PAYOUT_MINIMUM_ZAR', '500.00', 'number', 'referrals', 'Referral payout minimum in ZAR'),
    ('QR_REPLACEMENT_FEE_ZAR', '10.00', 'number', 'qr', 'QR replacement fee in ZAR'),
    ('REFERENCE_PREFIX', 'TPY', 'string', 'general', 'Reference prefix for all transactions')
ON CONFLICT (key) DO NOTHING;

-- Comments
COMMENT ON TABLE app_settings IS 'Key/value configuration store per Ledger §4 and §3';
COMMENT ON COLUMN app_settings.is_locked IS 'Locked settings cannot be modified via API (governance settings)';


