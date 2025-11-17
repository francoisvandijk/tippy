// Referrals API routes
// Ledger Reference: §7 (API Surface), §10 (Referrals), §24.4

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/db';
import { maskPhoneNumber, hashPhoneNumber } from '../../lib/utils';
import { logAuditEvent } from '../../lib/audit';

const router = Router();

// Validation schema
const createReferralSchema = z.object({
  referrer_id: z.string().uuid(),
  guard_msisdn: z.string().min(10).max(20), // Phone number
  guard_name: z.string().optional(),
  guard_language: z.string().optional().default('en'),
});

/**
 * POST /referrals/create
 * Create a referral record when referrer signs up a guard
 * Per Ledger §7: Referral endpoint
 * Per Ledger §10 and §24.4: Referrer activation & guard registration via referrer
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = createReferralSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { referrer_id, guard_msisdn, guard_name, guard_language } = validationResult.data;

    // TODO: Verify referrer authentication and active status (P1.6)
    // Verify referrer exists and is active
    const { data: referrer, error: referrerError } = await supabase
      .from('referrers')
      .select('id, msisdn, status, active')
      .eq('id', referrer_id)
      .single();

    if (referrerError || !referrer) {
      return res.status(404).json({
        error: 'VALIDATION_ERROR',
        message: 'Referrer not found',
      });
    }

    if (!referrer.active || referrer.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Referrer is not active',
      });
    }

    // Check for duplicate MSISDN lockout (90 days per Ledger §10.5)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: recentReferral } = await supabase
      .from('referrals')
      .select('id, created_at')
      .eq('referred_guard_msisdn', guard_msisdn)
      .gte('created_at', ninetyDaysAgo.toISOString())
      .single();

    if (recentReferral) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'This phone number was referred within the last 90 days (duplicate lockout)',
      });
    }

    // Check if guard already exists
    const { data: existingGuard } = await supabase
      .from('guards')
      .select('id, msisdn')
      .eq('msisdn', guard_msisdn)
      .single();

    let guardId: string;

    if (existingGuard) {
      guardId = existingGuard.id;
      
      // Check if referral already exists for this guard-referrer pair
      const { data: existingReferral } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', referrer_id)
        .eq('referred_guard_id', guardId)
        .single();

      if (existingReferral) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Referral already exists for this guard-referrer pair',
        });
      }
    } else {
      // TODO: Create guard registration flow (P1.3, P1.4)
      // For now, return error - guard must be created first
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Guard must be registered before creating referral. Use guard registration endpoint first.',
      });
    }

    // Create referral record
    const { data: referral, error: referralError } = await supabase
      .from('referrals')
      .insert({
        referrer_id: referrer_id,
        referred_guard_id: guardId,
        referred_guard_msisdn: guard_msisdn, // Denormalized for uniqueness check
        status: 'active',
        immutable_after: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days per Ledger §4
      })
      .select()
      .single();

    if (referralError) {
      console.error('Error creating referral:', referralError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to create referral',
      });
    }

    // Update referrer total_referrals count
    await supabase.rpc('increment', {
      table_name: 'referrers',
      column_name: 'total_referrals',
      id: referrer_id,
      amount: 1,
    }).catch(() => {
      // Fallback: manual update if RPC doesn't exist
      supabase
        .from('referrers')
        .update({ total_referrals: (referrer.total_referrals || 0) + 1 })
        .eq('id', referrer_id);
    });

    // Log audit event
    await logAuditEvent({
      event_type: 'referral_created',
      event_category: 'referral',
      actor_user_id: referrer_id, // TODO: Get from auth token (P1.6)
      actor_role: 'referrer',
      entity_type: 'referral',
      entity_id: referral.id,
      action: 'create',
      description: `Referrer ${maskPhoneNumber(referrer.msisdn)} created referral for guard ${maskPhoneNumber(guard_msisdn)}`,
      changes: {
        referrer_id,
        guard_id: guardId,
        guard_msisdn: maskPhoneNumber(guard_msisdn),
      },
      status: 'success',
      request_id: req.headers['x-request-id'] as string,
    });

    return res.status(201).json({
      id: referral.id,
      referrer_id: referral.referrer_id,
      referred_guard_id: referral.referred_guard_id,
      status: referral.status,
      immutable_after: referral.immutable_after,
      created_at: referral.created_at,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Referral creation error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

