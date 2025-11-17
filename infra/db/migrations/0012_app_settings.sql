-- Migration: 0012_app_settings.sql
-- Core Database Schema: App Settings
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §3 (Config), §4 (Data Model)

-- App settings table
-- Key/value configuration store for admin-editable defaults per Ledger §3
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Setting identification
    key VARCHAR(255) NOT NULL UNIQUE, -- Setting key (e.g., 'PLATFORM_FEE_PERCENT')
    category VARCHAR(100) NOT NULL DEFAULT 'general', -- 'fees', 'payouts', 'referrals', 'qr', 'general'
    
    -- Value (stored as text, can be parsed as needed)
    value TEXT NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    
    -- Metadata
    description TEXT, -- Human-readable description
    default_value TEXT, -- Default value if not set
    is_editable BOOLEAN NOT NULL DEFAULT true, -- Whether admin can edit
    is_public BOOLEAN NOT NULL DEFAULT false, -- Whether exposed to frontend
    
    -- Validation
    validation_rule JSONB, -- JSON schema or validation rules
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metadata
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_app_settings_key ON app_settings(key);
CREATE INDEX idx_app_settings_category ON app_settings(category);
CREATE INDEX idx_app_settings_is_editable ON app_settings(is_editable);
CREATE INDEX idx_app_settings_is_public ON app_settings(is_public);

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
INSERT INTO app_settings (key, category, value, value_type, description, default_value, is_editable, is_public) VALUES
    ('PAYMENT_PROVIDER', 'fees', 'Yoco', 'string', 'Payment provider name', 'Yoco', true, true),
    ('YOCO_FEES_MODE', 'fees', 'PercentOnly', 'string', 'Yoco fee calculation mode', 'PercentOnly', true, false),
    ('YOCO_FEE_PERCENT', 'fees', '0.00', 'number', 'Yoco fee percentage', '0.00', true, false),
    ('YOCO_FIXED_FEE', 'fees', '0.00', 'number', 'Yoco fixed fee in cents', '0.00', true, false),
    ('PLATFORM_FEE_PERCENT', 'fees', '10.00', 'number', 'Platform fee percentage', '10.00', true, false),
    ('VAT_ENABLED', 'fees', 'true', 'boolean', 'Whether VAT is enabled', 'true', true, false),
    ('VAT_RATE_PERCENT', 'fees', '15.00', 'number', 'VAT rate percentage', '15.00', true, false),
    ('CASH_SEND_FEE_ZAR', 'payouts', '9.00', 'number', 'CashSend fee in ZAR', '9.00', true, false),
    ('PAYOUT_WEEKLY_SCHEDULE', 'payouts', 'Sunday (covers Sat..Fri)', 'string', 'Weekly payout schedule', 'Sunday (covers Sat..Fri)', true, false),
    ('PAYOUT_MIN_ELIGIBILITY_ZAR', 'payouts', '500.00', 'number', 'Minimum payout eligibility in ZAR', '500.00', true, false),
    ('REFERRAL_FEE_PER_GUARD_ZAR', 'referrals', '20.00', 'number', 'Referral reward per guard in ZAR', '20.00', true, false),
    ('REFERRAL_TIP_THRESHOLD_ZAR', 'referrals', '500.00', 'number', 'Referral milestone threshold in ZAR', '500.00', true, false),
    ('REFERRAL_PAYOUT_MINIMUM_ZAR', 'referrals', '500.00', 'number', 'Minimum referral payout in ZAR', '500.00', true, false),
    ('QR_REPLACEMENT_FEE_ZAR', 'qr', '10.00', 'number', 'QR replacement fee in ZAR', '10.00', true, false),
    ('REFERENCE_PREFIX', 'general', 'TPY', 'string', 'Payment reference prefix', 'TPY', true, false)
ON CONFLICT (key) DO NOTHING;

-- Comments
COMMENT ON TABLE app_settings IS 'Admin-editable configuration store per Ledger §3 and §4';
COMMENT ON COLUMN app_settings.key IS 'Setting key (e.g., PLATFORM_FEE_PERCENT per Ledger §3)';
COMMENT ON COLUMN app_settings.value IS 'Setting value (stored as text, parsed by type)';

