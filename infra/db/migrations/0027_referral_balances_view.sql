-- Migration: 0027_referral_balances_view.sql
-- Phase 2: Referral Balances View
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.3 (Eligibility & Payout)

-- Referral Balances view
-- Accrued totals for payout eligibility (≥ R500)
CREATE OR REPLACE VIEW referral_balances AS
SELECT 
    referrer_id,
    SUM(CASE WHEN event_type = 'EARNED' THEN amount_zar_cents ELSE -amount_zar_cents END) AS accrued_balance_zar_cents,
    COUNT(CASE WHEN event_type = 'EARNED' THEN 1 END) AS earned_count,
    COUNT(CASE WHEN event_type = 'REVERSAL' THEN 1 END) AS reversal_count,
    MAX(created_at) AS last_event_at
FROM referral_earnings_ledger
GROUP BY referrer_id;

-- Comments
COMMENT ON VIEW referral_balances IS 'Accrued referral earnings totals for payout eligibility per Ledger §4 and §10.3';
COMMENT ON COLUMN referral_balances.accrued_balance_zar_cents IS 'Total accrued balance in ZAR cents (must be ≥ R500 for payout per Ledger §10.3)';


