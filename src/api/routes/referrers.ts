// Referrers API routes
// Ledger Reference: §7 (API Surface), §10 (Referrals), §24.4 (Referrer Activation & Guard Registration)
//
// Auth Requirements (Ledger §2, §8):
// - GET /referrers/me/guards: Requires 'referrer' role
//   - Returns only guards referred by the authenticated referrer
//   - No raw MSISDN in responses (POPIA compliance)

import { Router, Request, Response } from 'express';

import { requireAuth, requireRole } from '../../lib/auth';
import { supabase } from '../../lib/db';

const router = Router();

/**
 * GET /referrers/me/guards
 * Get list of guards referred by current referrer
 * Per Ledger §7: Referral endpoint
 * Per Ledger §10: Referrals visibility
 * Per Ledger §24.4: Referrer can view own referred guards
 * 
 * Auth: Requires 'referrer' role (Ledger §2.4, §8)
 * - Uses req.auth.userId to identify referrer
 * - RLS ensures referrer can only see their own referrals
 */
router.get(
  '/me/guards',
  requireAuth,
  requireRole('referrer'),
  async (req: Request, res: Response) => {
    try {
      const referrerId = req.auth!.userId;

      // Fetch referrals for this referrer
      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select(`
          id,
          status,
          created_at,
          milestone_reached_at,
          guards!inner(
            id,
            display_name,
            status,
            lifetime_gross_tips,
            lifetime_net_tips,
            created_at,
            activated_at
          )
        `)
        .eq('referrer_id', referrerId)
        .order('created_at', { ascending: false });

      if (referralsError) {
        console.error("[referrers] Error fetching referrals", referralsError?.message);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch referred guards',
        });
      }

      // Format response (no raw MSISDN per POPIA)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const guards = (referrals || []).map((referral: any) => ({
        referral_id: referral.id,
        referral_status: referral.status,
        referral_created_at: referral.created_at,
        milestone_reached_at: referral.milestone_reached_at,
        guard: {
          id: referral.guards?.id,
          display_name: referral.guards?.display_name,
          status: referral.guards?.status,
          lifetime_gross_tips_zar_cents: referral.guards?.lifetime_gross_tips || 0,
          lifetime_net_tips_zar_cents: referral.guards?.lifetime_net_tips || 0,
          created_at: referral.guards?.created_at,
          activated_at: referral.guards?.activated_at,
        },
      }));

      return res.status(200).json({
        guards,
        total: guards.length,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[referrers] Error fetching referred guards", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch referred guards',
      });
    }
  }
);

/**
 * GET /referrers/earnings/summary
 * Get earnings summary for current referrer
 * Per Ledger §7: Referral endpoint
 * Per Ledger §10: Referrals earnings visibility
 * 
 * Auth: Requires 'referrer' role (Ledger §2.4, §8)
 * - Uses req.auth.userId to identify referrer
 * - Returns total earnings, available balance, and breakdown
 */
router.get(
  '/earnings/summary',
  requireAuth,
  requireRole('referrer'),
  async (req: Request, res: Response) => {
    try {
      const referrerId = req.auth!.userId;

      // Fetch balance from referral_balances view
      const { data: balanceData, error: balanceError } = await supabase
        .from('referral_balances')
        .select('*')
        .eq('referrer_id', referrerId)
        .single();

      // Handle case where no balance exists (PGRST116 = no rows)
      if (balanceError && balanceError.code !== 'PGRST116') {
        console.error('[referrers] Error fetching earnings balance', balanceError?.message);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch earnings summary',
        });
      }

      const balance = balanceData || {
        referrer_id: referrerId,
        accrued_balance_zar_cents: 0,
        earned_count: 0,
        reversal_count: 0,
        last_event_at: null,
      };

      // Fetch ledger entries for breakdown
      const { data: ledgerEntries, error: ledgerError } = await supabase
        .from('referral_earnings_ledger')
        .select('event_type, amount_zar_cents, balance_after_zar_cents, created_at')
        .eq('referrer_id', referrerId)
        .order('created_at', { ascending: false });

      if (ledgerError) {
        console.error('[referrers] Error fetching earnings breakdown', ledgerError?.message);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch earnings breakdown',
        });
      }

      // Calculate totals from ledger entries
      const totalEarned = (ledgerEntries || [])
        .filter((entry) => entry.event_type === 'EARNED')
        .reduce((sum, entry) => sum + entry.amount_zar_cents, 0);

      const availableEarnings = balance.accrued_balance_zar_cents || 0;
      const pendingReversals = 0; // Not implemented in current schema

      // Format breakdown
      const breakdown = (ledgerEntries || []).map((entry) => ({
        event_type: entry.event_type,
        amount_zar_cents: entry.amount_zar_cents,
        balance_after_zar_cents: entry.balance_after_zar_cents,
        created_at: entry.created_at,
      }));

      return res.status(200).json({
        total_earnings_zar_cents: totalEarned,
        available_earnings_zar_cents: availableEarnings,
        pending_reversals_zar_cents: pendingReversals,
        breakdown,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[referrers] Error fetching earnings summary', errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch earnings summary',
      });
    }
  }
);

export default router;

