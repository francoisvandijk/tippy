-- Migration: 0016_referral_balances_view.sql
-- Core Database Schema: Referral Balances View
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model), §10.3

-- Referral balances view
-- Accrued totals for payout eligibility per Ledger §4 and §10.3
CREATE OR REPLACE VIEW referral_balances AS
SELECT 
    r.id AS referrer_id,
    r.msisdn AS referrer_msisdn,
    r.display_name AS referrer_name,
    r.active AS referrer_active,
    
    -- Earnings summary
    COALESCE(SUM(
        CASE 
            WHEN el.event_type = 'EARNED' THEN el.amount
            WHEN el.event_type = 'REVERSAL' THEN -el.amount
            ELSE 0
        END
    ), 0) AS accrued_balance, -- In ZAR cents
    
    -- Counts
    COUNT(DISTINCT ref.id) AS total_referrals,
    COUNT(DISTINCT CASE WHEN ref.status = 'milestone_reached' THEN ref.id END) AS milestones_reached,
    COUNT(DISTINCT CASE WHEN el.event_type = 'EARNED' AND el.status = 'paid' THEN el.id END) AS paid_earnings_count,
    
    -- Totals
    COALESCE(SUM(CASE WHEN el.event_type = 'EARNED' THEN el.amount ELSE 0 END), 0) AS total_earned, -- In ZAR cents
    COALESCE(SUM(CASE WHEN el.event_type = 'REVERSAL' THEN el.amount ELSE 0 END), 0) AS total_reversed, -- In ZAR cents
    COALESCE(SUM(CASE WHEN el.event_type = 'EARNED' AND el.status = 'paid' THEN el.amount ELSE 0 END), 0) AS total_paid_out, -- In ZAR cents
    
    -- Eligibility
    CASE 
        WHEN COALESCE(SUM(
            CASE 
                WHEN el.event_type = 'EARNED' THEN el.amount
                WHEN el.event_type = 'REVERSAL' THEN -el.amount
                ELSE 0
            END
        ), 0) >= 50000 THEN true -- R500 in cents per Ledger §10.3
        ELSE false
    END AS is_payout_eligible,
    
    -- Timestamps
    MIN(el.created_at) AS first_earned_at,
    MAX(el.created_at) AS last_earned_at
    
FROM referrers r
LEFT JOIN referrals ref ON ref.referrer_id = r.id
LEFT JOIN referral_earnings_ledger el ON el.referrer_id = r.id AND el.status = 'active'
WHERE r.active = true
GROUP BY r.id, r.msisdn, r.display_name, r.active;

-- Comments
COMMENT ON VIEW referral_balances IS 'Accrued referral totals for payout eligibility per Ledger §4 and §10.3';
COMMENT ON COLUMN referral_balances.accrued_balance IS 'Current accrued balance in ZAR cents (earned - reversed)';
COMMENT ON COLUMN referral_balances.is_payout_eligible IS 'Whether referrer is eligible for payout (≥R500) per Ledger §10.3';

