-- Migration: 0028_payout_batches.sql
-- Phase 2: Payout Batches Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §9 (Payouts)

-- Payout Batches table
-- Weekly payout batches (Sat 00:00 → Fri 23:59, processed Sunday)
CREATE TABLE IF NOT EXISTS payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch identification
    batch_number VARCHAR(50) NOT NULL UNIQUE, -- Format: TPY-PAYOUT-YYYYMMDD-<id>
    reference_prefix VARCHAR(10) NOT NULL DEFAULT 'TPY',
    
    -- Period covered
    period_start_date DATE NOT NULL, -- Saturday 00:00
    period_end_date DATE NOT NULL, -- Friday 23:59
    processed_date DATE NOT NULL, -- Sunday (processing date)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'generated', 'processing', 'processed', 'failed', 'cancelled')),
    
    -- Totals (in ZAR cents)
    total_amount_zar_cents BIGINT NOT NULL DEFAULT 0,
    total_cashsend_fees_zar_cents BIGINT NOT NULL DEFAULT 0,
    total_beneficiaries INTEGER NOT NULL DEFAULT 0,
    
    -- CashSend integration
    cashsend_batch_id VARCHAR(255), -- CashSend batch reference
    cashsend_status VARCHAR(50),
    
    -- CSV export (Tier-3 per Ledger §9)
    csv_export_url TEXT,
    csv_exported_at TIMESTAMPTZ,
    email_sent_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_payout_batches_batch_number ON payout_batches(batch_number);
CREATE INDEX idx_payout_batches_status ON payout_batches(status);
CREATE INDEX idx_payout_batches_period_start_date ON payout_batches(period_start_date DESC);
CREATE INDEX idx_payout_batches_processed_date ON payout_batches(processed_date DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payout_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER payout_batches_updated_at
    BEFORE UPDATE ON payout_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_payout_batches_updated_at();

-- Comments
COMMENT ON TABLE payout_batches IS 'Weekly payout batches per Ledger §4 and §9';
COMMENT ON COLUMN payout_batches.period_start_date IS 'Saturday 00:00 (start of payout period)';
COMMENT ON COLUMN payout_batches.period_end_date IS 'Friday 23:59 (end of payout period)';
COMMENT ON COLUMN payout_batches.processed_date IS 'Sunday (processing date)';


