-- Migration: 0029_payout_batch_items.sql
-- Phase 2: Payout Batch Items Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §9 (Payouts)

-- Payout Batch Items table
-- Line items within a payout batch (GUARD, REFERRAL, QR_REPLACEMENT)
CREATE TABLE IF NOT EXISTS payout_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    payout_batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
    
    -- Beneficiary (guard or referrer)
    guard_id UUID REFERENCES guards(id) ON DELETE RESTRICT,
    referrer_id UUID REFERENCES referrers(id) ON DELETE RESTRICT,
    
    -- Item type
    item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('GUARD', 'REFERRAL', 'QR_REPLACEMENT')),
    
    -- Amounts (in ZAR cents)
    amount_zar_cents BIGINT NOT NULL CHECK (amount_zar_cents > 0),
    cashsend_fee_zar_cents BIGINT NOT NULL DEFAULT 900, -- R9.00 per Ledger §9
    
    -- Net amount after CashSend fee
    net_amount_zar_cents BIGINT NOT NULL,
    
    -- CashSend integration
    cashsend_recipient_id VARCHAR(255),
    cashsend_status VARCHAR(50),
    cashsend_transaction_id VARCHAR(255),
    
    -- Reference to source (payment, referral earnings, etc.)
    source_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    source_referral_earnings_id UUID REFERENCES referral_earnings_ledger(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    
    -- Error tracking
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_payout_batch_items_payout_batch_id ON payout_batch_items(payout_batch_id);
CREATE INDEX idx_payout_batch_items_guard_id ON payout_batch_items(guard_id) WHERE guard_id IS NOT NULL;
CREATE INDEX idx_payout_batch_items_referrer_id ON payout_batch_items(referrer_id) WHERE referrer_id IS NOT NULL;
CREATE INDEX idx_payout_batch_items_item_type ON payout_batch_items(item_type);
CREATE INDEX idx_payout_batch_items_status ON payout_batch_items(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payout_batch_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER payout_batch_items_updated_at
    BEFORE UPDATE ON payout_batch_items
    FOR EACH ROW
    EXECUTE FUNCTION update_payout_batch_items_updated_at();

-- Comments
COMMENT ON TABLE payout_batch_items IS 'Line items within payout batches per Ledger §4 and §9';
COMMENT ON COLUMN payout_batch_items.item_type IS 'GUARD, REFERRAL, or QR_REPLACEMENT per Ledger §9';
COMMENT ON COLUMN payout_batch_items.cashsend_fee_zar_cents IS 'R9.00 CashSend fee per beneficiary per Ledger §9';


