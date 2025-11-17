// Referrers API routes
// Ledger Reference: §7 (API Surface), §10 (Referrals)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/db';
import { maskPhoneNumber } from '../../lib/utils';

const router = Router();

/**
 * GET /referrers/earnings/summary
 * Get referrer's accrued earnings summary
 * Per Ledger §7: Referral endpoint
 * Per Ledger §10.3: Eligibility & Payout
 */
router.get('/earnings/summary', async (req: Request, res: Response) => {
  try {
    // TODO: Extract referrer_id from authentication token (P1.6)
    const referrerId = req.query.referrer_id as string;

    if (!referrerId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'referrer_id is required',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(referrerId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid referrer_id format',
      });
    }

    // Fetch referrer profile
    const { data: referrer, error: referrerError } = await supabase
      .from('referrers')
      .select('id, display_name, msisdn, active, total_referrals, total_earned, total_paid_out')
      .eq('id', referrerId)
      .single();

    if (referrerError || !referrer) {
      return res.status(404).json({
        error: 'VALIDATION_ERROR',
        message: 'Referrer not found',
      });
    }

    // Fetch from referral_balances view (per Ledger §4 and §10.3)
    const { data: balance, error: balanceError } = await supabase
      .from('referral_balances')
      .select('*')
      .eq('referrer_id', referrerId)
      .single();

    // If view doesn't return data, compute from referral_earnings_ledger
    let accruedBalance = 0;
    let totalEarned = 0;
    let totalReversed = 0;
    let totalPaidOut = 0;

    if (balance) {
      accruedBalance = balance.accrued_balance || 0;
      totalEarned = balance.total_earned || 0;
      totalReversed = balance.total_reversed || 0;
      totalPaidOut = balance.total_paid_out || 0;
    } else {
      // Fallback: compute from ledger
      const { data: earnings } = await supabase
        .from('referral_earnings_ledger')
        .select('event_type, amount, status')
        .eq('referrer_id', referrerId)
        .eq('status', 'active');

      if (earnings) {
        earnings.forEach((entry) => {
          if (entry.event_type === 'EARNED') {
            totalEarned += entry.amount;
            if (entry.status === 'paid') {
              totalPaidOut += entry.amount;
            } else {
              accruedBalance += entry.amount;
            }
          } else if (entry.event_type === 'REVERSAL') {
            totalReversed += entry.amount;
            accruedBalance -= entry.amount;
          }
        });
      }
    }

    const isEligibleForPayout = accruedBalance >= 50000; // R500 in cents per Ledger §10.3

    return res.status(200).json({
      referrer_id: referrer.id,
      display_name: referrer.display_name,
      msisdn: maskPhoneNumber(referrer.msisdn), // Masked per Ledger §13.3
      active: referrer.active,
      earnings: {
        accrued_balance: accruedBalance,
        total_earned: totalEarned,
        total_reversed: totalReversed,
        total_paid_out: totalPaidOut,
        is_eligible_for_payout: isEligibleForPayout,
      },
      referrals: {
        total: referrer.total_referrals || 0,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Referrer earnings fetch error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /referrers/referrals
 * List referred guards and their status
 * Per Ledger §7: Referral endpoint
 */
router.get('/referrals', async (req: Request, res: Response) => {
  try {
    // TODO: Extract referrer_id from authentication token (P1.6)
    const referrerId = req.query.referrer_id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    if (!referrerId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'referrer_id is required',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(referrerId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid referrer_id format',
      });
    }

    // Fetch referrals with guard details
    const { data: referrals, error: referralsError } = await supabase
      .from('referrals')
      .select(`
        id,
        referred_guard_id,
        status,
        milestone_reached_at,
        immutable_after,
        created_at,
        guards:referred_guard_id (
          id,
          display_name,
          status,
          lifetime_gross_tips,
          lifetime_net_tips
        )
      `)
      .eq('referrer_id', referrerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (referralsError) {
      console.error('Error fetching referrals:', referralsError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch referrals',
      });
    }

    // Get total count
    const { count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', referrerId);

    return res.status(200).json({
      referrals: referrals?.map((ref) => ({
        id: ref.id,
        guard: ref.guards ? {
          id: ref.guards.id,
          display_name: ref.guards.display_name,
          status: ref.guards.status,
          lifetime_gross_tips: ref.guards.lifetime_gross_tips,
          lifetime_net_tips: ref.guards.lifetime_net_tips,
        } : null,
        status: ref.status,
        milestone_reached_at: ref.milestone_reached_at,
        created_at: ref.created_at,
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Referrals list fetch error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

