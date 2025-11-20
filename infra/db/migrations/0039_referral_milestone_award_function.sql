-- Migration: 0039_referral_milestone_award_function.sql
-- Purpose: Referral milestone award helper function
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final) §4 (Data Model), §6.5 (Referrals), §9 (Payouts), §10 (Referrals Domain)

CREATE OR REPLACE FUNCTION award_referral_milestone(
    p_referral_id UUID,
    p_referrer_id UUID,
    p_guard_id UUID,
    p_guard_lifetime_gross BIGINT,
    p_milestone_amount_zar_cents BIGINT DEFAULT 50000,
    p_reward_amount_zar_cents BIGINT DEFAULT 2000
)
RETURNS TABLE (
    milestone_id UUID,
    referrer_id UUID,
    referral_id UUID,
    guard_id UUID,
    reward_amount_zar_cents BIGINT,
    balance_after_zar_cents BIGINT
) AS $$
DECLARE
    v_milestone_id UUID;
    v_balance BIGINT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    WITH inserted AS (
        INSERT INTO referral_milestones (
            referral_id,
            referrer_id,
            guard_id,
            milestone_type,
            milestone_amount_zar_cents,
            guard_lifetime_gross_at_milestone,
            reward_amount_zar_cents,
            status,
            rewarded_at
        )
        VALUES (
            p_referral_id,
            p_referrer_id,
            p_guard_id,
            'r500_gross',
            p_milestone_amount_zar_cents,
            p_guard_lifetime_gross,
            p_reward_amount_zar_cents,
            'rewarded',
            v_now
        )
        ON CONFLICT (referral_id) DO NOTHING
        RETURNING id
    )
    SELECT id INTO v_milestone_id FROM inserted;

    -- Nothing to do if milestone already existed
    IF v_milestone_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN event_type = 'EARNED' THEN amount_zar_cents
                ELSE -amount_zar_cents
            END
        ),
        0
    )
    INTO v_balance
    FROM referral_earnings_ledger
    WHERE referrer_id = p_referrer_id;

    v_balance := v_balance + p_reward_amount_zar_cents;

    INSERT INTO referral_earnings_ledger (
        referrer_id,
        referral_id,
        milestone_id,
        event_type,
        amount_zar_cents,
        balance_after_zar_cents,
        metadata
    )
    VALUES (
        p_referrer_id,
        p_referral_id,
        v_milestone_id,
        'EARNED',
        p_reward_amount_zar_cents,
        v_balance,
        jsonb_build_object(
            'milestone_type', 'r500_gross',
            'milestone_amount_zar_cents', p_milestone_amount_zar_cents,
            'guard_id', p_guard_id,
            'guard_lifetime_gross_at_milestone', p_guard_lifetime_gross
        )
    );

    UPDATE referrals
    SET status = 'milestone_reached',
        milestone_reached_at = v_now
    WHERE id = p_referral_id
      AND (milestone_reached_at IS NULL OR milestone_reached_at > v_now);

    RETURN QUERY
    SELECT
        v_milestone_id,
        p_referrer_id,
        p_referral_id,
        p_guard_id,
        p_reward_amount_zar_cents,
        v_balance;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION award_referral_milestone IS
'Awards the Ledger-mandated R20 referral reward when a referred guard crosses the R500 milestone. Handles milestone record creation, ledger entry, and referral status update atomically.';


