-- Migration: 0004_payments.sql
-- Phase 2: Payments & Yoco Integration
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §§4-5, §9

-- Payments table
-- Stores individual tip/payment events with full fee breakdown
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Payment identification
    reference_prefix VARCHAR(10) NOT NULL DEFAULT 'TPY',
    reference_number VARCHAR(50) NOT NULL UNIQUE,
    yoco_charge_id VARCHAR(255) UNIQUE,
    yoco_payment_id VARCHAR(255),
    
    -- Relationships
    -- Note: Foreign key constraints added in later migration (0037) after referenced tables exist
    guard_id UUID NOT NULL,
    qr_code_id UUID,
    user_id UUID,
    
    -- Amounts (all in ZAR cents)
    amount_gross BIGINT NOT NULL CHECK (amount_gross > 0),
    processor_fee BIGINT NOT NULL DEFAULT 0,
    platform_fee BIGINT NOT NULL DEFAULT 0,
    vat_on_platform BIGINT NOT NULL DEFAULT 0,
    amount_net BIGINT NOT NULL CHECK (amount_net >= 0),
    
    -- Payment status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
    
    -- Yoco integration
    yoco_status VARCHAR(50),
    yoco_failure_reason TEXT,
    
    -- Card information (masked, POPIA-compliant)
    card_last_four VARCHAR(4),
    card_brand VARCHAR(50),
    
    -- Metadata
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Payout linkage
    -- Note: Foreign key constraint added in later migration (0037) after payout_batches table exists
    payout_batch_id UUID,
    
    -- Audit
    audit_log JSONB
);

-- Indexes for performance
CREATE INDEX idx_payments_guard_id ON payments(guard_id);
CREATE INDEX idx_payments_qr_code_id ON payments(qr_code_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_yoco_charge_id ON payments(yoco_charge_id) WHERE yoco_charge_id IS NOT NULL;
CREATE INDEX idx_payments_reference_number ON payments(reference_number);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_payout_batch_id ON payments(payout_batch_id) WHERE payout_batch_id IS NOT NULL;
CREATE INDEX idx_payments_guard_created ON payments(guard_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

-- Function to calculate fees (per Ledger §5)
CREATE OR REPLACE FUNCTION calculate_payment_fees(
    gross_amount_cents BIGINT,
    yoco_fee_percent NUMERIC DEFAULT 0.00,
    platform_fee_percent NUMERIC DEFAULT 10.00,
    vat_rate_percent NUMERIC DEFAULT 15.00
)
RETURNS TABLE (
    processor_fee BIGINT,
    platform_fee BIGINT,
    vat_on_platform BIGINT,
    net_amount BIGINT
) AS $$
DECLARE
    proc_fee BIGINT;
    plat_fee BIGINT;
    vat_fee BIGINT;
    net BIGINT;
BEGIN
    -- Processor fee: amount_gross * YOCO_FEE_PERCENT/100 (§5.1)
    proc_fee := ROUND(gross_amount_cents * yoco_fee_percent / 100);
    
    -- Platform fee: amount_gross * PLATFORM_FEE_PERCENT/100 (§5.2)
    plat_fee := ROUND(gross_amount_cents * platform_fee_percent / 100);
    
    -- VAT: platform_fee * VAT_RATE_PERCENT/100 (§5.3)
    vat_fee := ROUND(plat_fee * vat_rate_percent / 100);
    
    -- Net: gross - processor_fee - platform_fee - vat_on_platform (§5.4)
    net := gross_amount_cents - proc_fee - plat_fee - vat_fee;
    
    RETURN QUERY SELECT proc_fee, plat_fee, vat_fee, net;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE payments IS 'Stores individual tip/payment events with full fee breakdown per Ledger §4 and §5';
COMMENT ON COLUMN payments.amount_gross IS 'Gross payment amount in ZAR cents';
COMMENT ON COLUMN payments.processor_fee IS 'Yoco processor fee in ZAR cents (per §5.1)';
COMMENT ON COLUMN payments.platform_fee IS 'Platform fee in ZAR cents (per §5.2)';
COMMENT ON COLUMN payments.vat_on_platform IS 'VAT on platform fee in ZAR cents (per §5.3)';
COMMENT ON COLUMN payments.amount_net IS 'Net amount to pool in ZAR cents (per §5.4)';
COMMENT ON COLUMN payments.reference_number IS 'Unique payment reference (format: TPY-PAYOUT-YYYYMMDD-<id>)';
COMMENT ON COLUMN payments.card_last_four IS 'Last 4 digits of card (masked, POPIA-compliant)';
COMMENT ON COLUMN payments.metadata IS 'Additional payment metadata (no PII)';

