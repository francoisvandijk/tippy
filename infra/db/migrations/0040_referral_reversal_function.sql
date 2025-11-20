-- Migration: 0040_referral_reversal_function.sql
-- Purpose: Referral milestone reversal (T+30 chargeback) helper function
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final) §4 (Data Model), §10.2 (Milestone Logic), §10.3 (Eligibility & Payout)

CREATE OR REPLACE FUNCTION reverse_referral_milestone(
    p_milestone_id UUID,
    p_earned_ledger_id UUID,
    p_reversal_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
    reversal_id UUID,
    balance_after_zar_cents BIGINT
) AS $$
DECLARE
    v_milestone_record RECORD;
    v_earned_record RECORD;
    v_reversal_id UUID;
    v_balance BIGINT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Fetch milestone details
    SELECT
        id,
        referrer_id,
        referral_id,
        guard_id,
        reward_amount_zar_cents,
        status
    INTO v_milestone_record
    FROM referral_milestones
    WHERE id = p_milestone_id;

    -- Validate milestone exists and is in 'rewarded' status
    IF v_milestone_record IS NULL THEN
        RAISE EXCEPTION 'Milestone % not found', p_milestone_id;
    END IF;

    IF v_milestone_record.status != 'rewarded' THEN
        RAISE EXCEPTION 'Milestone % is not in rewarded status (current: %)', p_milestone_id, v_milestone_record.status;
    END IF;

    -- Fetch the original EARNED ledger entry
    SELECT
        id,
        referrer_id,
        amount_zar_cents
    INTO v_earned_record
    FROM referral_earnings_ledger
    WHERE id = p_earned_ledger_id
      AND event_type = 'EARNED'
      AND milestone_id = p_milestone_id;

    -- Validate earned entry exists
    IF v_earned_record IS NULL THEN
        RAISE EXCEPTION 'EARNED ledger entry % not found for milestone %', p_earned_ledger_id, p_milestone_id;
    END IF;

    -- Check if reversal already exists (idempotency)
    SELECT id INTO v_reversal_id
    FROM referral_earnings_ledger
    WHERE reversal_reference_id = p_earned_ledger_id
      AND event_type = 'REVERSAL';

    IF v_reversal_id IS NOT NULL THEN
        -- Reversal already exists - return existing reversal
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
        WHERE referrer_id = v_milestone_record.referrer_id;

        RETURN QUERY
        SELECT
            v_reversal_id,
            v_balance;
        RETURN;
    END IF;

    -- Calculate current balance before reversal
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
    WHERE referrer_id = v_milestone_record.referrer_id;

    -- Calculate balance after reversal
    v_balance := GREATEST(0, v_balance - v_earned_record.amount_zar_cents);

    -- Create REVERSAL ledger entry
    INSERT INTO referral_earnings_ledger (
        referrer_id,
        referral_id,
        milestone_id,
        event_type,
        amount_zar_cents,
        balance_after_zar_cents,
        reversal_reason,
        reversal_reference_id,
        metadata
    )
    VALUES (
        v_milestone_record.referrer_id,
        v_milestone_record.referral_id,
        p_milestone_id,
        'REVERSAL',
        v_earned_record.amount_zar_cents,
        v_balance,
        p_reversal_reason,
        p_earned_ledger_id,
        jsonb_build_object(
            'reversal_type', 't30_chargeback',
            'original_earned_id', p_earned_ledger_id,
            'milestone_id', p_milestone_id,
            'guard_id', v_milestone_record.guard_id
        )
    )
    RETURNING id INTO v_reversal_id;

    -- Update milestone status to 'reversed'
    UPDATE referral_milestones
    SET status = 'reversed',
        reversed_at = v_now
    WHERE id = p_milestone_id;

    -- Update referral status if needed (optional - keep as milestone_reached for audit trail)
    -- The referral status remains 'milestone_reached' to preserve audit history

    RETURN QUERY
    SELECT
        v_reversal_id,
        v_balance;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION reverse_referral_milestone IS
'Reverses a referral milestone reward (T+30 chargeback logic per Ledger §10.2). Creates a REVERSAL ledger entry, updates milestone status, and maintains idempotency.';

