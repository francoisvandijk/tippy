// Guards API routes
// Ledger Reference: §7 (API Surface), §6 (Key Workflows), §26

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/db';
import { maskPhoneNumber } from '../../lib/utils';
import { logAuditEvent } from '../../lib/audit';

const router = Router();

/**
 * GET /guards/me
 * Get current guard's profile and earnings summary
 * Per Ledger §7: Guard endpoint (optional, for guard console)
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    // TODO: Extract guard_id from authentication token (P1.6)
    // For now, accept guard_id as query param (temporary until auth is implemented)
    const guardId = req.query.guard_id as string;
    
    if (!guardId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'guard_id is required',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(guardId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid guard_id format',
      });
    }

    // Fetch guard profile
    const { data: guard, error: guardError } = await supabase
      .from('guards')
      .select(`
        id,
        display_name,
        status,
        lifetime_gross_tips,
        lifetime_net_tips,
        lifetime_payouts,
        language,
        created_at,
        activated_at
      `)
      .eq('id', guardId)
      .single();

    if (guardError || !guard) {
      return res.status(404).json({
        error: 'VALIDATION_ERROR',
        message: 'Guard not found',
      });
    }

    // Fetch active QR code
    const { data: activeQr } = await supabase
      .from('qr_codes')
      .select('id, code, short_code, status, assigned_at')
      .eq('assigned_guard_id', guardId)
      .eq('status', 'active')
      .single();

    // Fetch recent payments (last 5 per Ledger §6.2)
    const { data: recentPayments } = await supabase
      .from('payments')
      .select('id, amount_gross, amount_net, status, created_at')
      .eq('guard_id', guardId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(5);

    // Calculate current balance (net tips - payouts)
    const currentBalance = guard.lifetime_net_tips - guard.lifetime_payouts;
    const isEligibleForPayout = currentBalance >= 50000; // R500 in cents per Ledger §9

    return res.status(200).json({
      id: guard.id,
      display_name: guard.display_name,
      status: guard.status,
      earnings: {
        lifetime_gross: guard.lifetime_gross_tips,
        lifetime_net: guard.lifetime_net_tips,
        lifetime_payouts: guard.lifetime_payouts,
        current_balance: currentBalance,
        is_eligible_for_payout: isEligibleForPayout,
      },
      qr_code: activeQr ? {
        id: activeQr.id,
        code: activeQr.code,
        short_code: activeQr.short_code,
        assigned_at: activeQr.assigned_at,
      } : null,
      recent_payments: recentPayments || [],
      language: guard.language,
      created_at: guard.created_at,
      activated_at: guard.activated_at,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Guard profile fetch error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

