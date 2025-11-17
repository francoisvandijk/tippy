-- Migration: 0005_payout_batches.sql
-- Core Database Schema: Payout Batches
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §9

-- Payout batches table
-- Weekly payout batch runs per Ledger §9
CREATE TABLE IF NOT EXISTS payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch identification
    batch_number VARCHAR(50) NOT NULL UNIQUE, -- Format: TPY-PAYOUT-YYYYMMDD-<id>
    reference_prefix VARCHAR(10) NOT NULL DEFAULT 'TPY',
    
    -- Period covered
    period_start_date DATE NOT NULL, -- Saturday 00:00 per §9
    period_end_date DATE NOT NULL, -- Friday 23:59 per §9
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Totals
    total_guard_payouts BIGINT NOT NULL DEFAULT 0 CHECK (total_guard_payouts >= 0), -- In ZAR cents
    total_referral_payouts BIGINT NOT NULL DEFAULT 0 CHECK (total_referral_payouts >= 0), -- In ZAR cents
    total_cashsend_fees BIGINT NOT NULL DEFAULT 0 CHECK (total_cashsend_fees >= 0), -- In ZAR cents
    total_beneficiaries INTEGER NOT NULL DEFAULT 0 CHECK (total_beneficiaries >= 0),
    
    -- CashSend integration
    cashsend_batch_id VARCHAR(255), -- External CashSend batch reference
    cashsend_export_url TEXT, -- URL to exported CSV/file
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB,
    audit_log JSONB
);

-- Payout batch items table
-- Individual line items within a payout batch
CREATE TABLE IF NOT EXISTS payout_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch linkage
    payout_batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
    
    -- Beneficiary
    beneficiary_type VARCHAR(50) NOT NULL CHECK (beneficiary_type IN ('GUARD', 'REFERRAL', 'QR_REPLACEMENT')),
    beneficiary_id UUID NOT NULL, -- References guards.id or referrers.id depending on type
    beneficiary_msisdn VARCHAR(20) NOT NULL, -- Masked/hashed per §13
    
    -- Amounts
    amount_gross BIGINT NOT NULL CHECK (amount_gross > 0), -- In ZAR cents
    cashsend_fee BIGINT NOT NULL DEFAULT 0 CHECK (cashsend_fee >= 0), -- In ZAR cents (one per beneficiary per §5.5)
    amount_net BIGINT NOT NULL CHECK (amount_net >= 0), -- In ZAR cents
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    
    -- CashSend integration
    cashsend_reference VARCHAR(255),
    cashsend_status VARCHAR(50),
    cashsend_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB
);

-- Indexes for payout_batches
CREATE INDEX idx_payout_batches_batch_number ON payout_batches(batch_number);
CREATE INDEX idx_payout_batches_status ON payout_batches(status);
CREATE INDEX idx_payout_batches_period ON payout_batches(period_start_date, period_end_date);
CREATE INDEX idx_payout_batches_created_at ON payout_batches(created_at DESC);

-- Indexes for payout_batch_items
CREATE INDEX idx_payout_batch_items_batch_id ON payout_batch_items(payout_batch_id);
CREATE INDEX idx_payout_batch_items_beneficiary ON payout_batch_items(beneficiary_type, beneficiary_id);
CREATE INDEX idx_payout_batch_items_status ON payout_batch_items(status);
CREATE INDEX idx_payout_batch_items_created_at ON payout_batch_items(created_at DESC);

-- Comments
COMMENT ON TABLE payout_batches IS 'Weekly payout batches per Ledger §9';
COMMENT ON TABLE payout_batch_items IS 'Individual payout line items per Ledger §9';
COMMENT ON COLUMN payout_batches.period_start_date IS 'Saturday 00:00 per Ledger §9';
COMMENT ON COLUMN payout_batches.period_end_date IS 'Friday 23:59 per Ledger §9';
COMMENT ON COLUMN payout_batch_items.beneficiary_type IS 'Type: GUARD, REFERRAL, or QR_REPLACEMENT per Ledger §9';
COMMENT ON COLUMN payout_batch_items.cashsend_fee IS 'One fee per beneficiary per batch per Ledger §5.5';

