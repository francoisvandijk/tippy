// Admin Payouts API routes
// Ledger Reference: §7 (API Surface), §9 (Payouts)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../../lib/db';
import { logAuditEvent } from '../../../lib/audit';

const router = Router();

// Validation schema
const generatePayoutSchema = z.object({
  period_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  period_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
});

/**
 * POST /admin/payouts/generate
 * Trigger creation of a payout batch record (basic skeleton)
 * Per Ledger §7: Admin endpoint
 * Per Ledger §9: Payouts (Weekly)
 * 
 * TODO (P1.5): Full payout computation logic including:
 * - Computing payout_batch_items from payments and referral_earnings_ledger
 * - CashSend integration
 * - CSV export generation
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    // TODO: Verify admin authentication (P1.6)
    const adminUserId = req.body.admin_user_id as string;

    // Validate request body
    const validationResult = generatePayoutSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { period_start_date, period_end_date } = validationResult.data;

    // Validate dates
    const startDate = new Date(period_start_date);
    const endDate = new Date(period_end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid date format',
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'period_start_date must be before period_end_date',
      });
    }

    // Generate batch number per Ledger format: TPY-PAYOUT-YYYYMMDD-<id>
    const dateStr = endDate.toISOString().slice(0, 10).replace(/-/g, '');
    const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const batchNumber = `TPY-PAYOUT-${dateStr}-${randomId}`;

    // Create payout batch with status='pending' (will be 'generating' when computation starts in P1.5)
    const { data: batch, error: batchError } = await supabase
      .from('payout_batches')
      .insert({
        batch_number: batchNumber,
        reference_prefix: 'TPY',
        period_start_date: period_start_date,
        period_end_date: period_end_date,
        status: 'pending', // Will change to 'generating' when computation starts (P1.5)
        total_guard_payouts: 0, // TODO: Compute in P1.5
        total_referral_payouts: 0, // TODO: Compute in P1.5
        total_cashsend_fees: 0, // TODO: Compute in P1.5
        total_beneficiaries: 0, // TODO: Compute in P1.5
      })
      .select()
      .single();

    if (batchError) {
      console.error('Error creating payout batch:', batchError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to create payout batch',
      });
    }

    // Log audit event
    await logAuditEvent({
      event_type: 'payout_batch_created',
      event_category: 'payout',
      actor_user_id: adminUserId,
      actor_role: 'admin',
      entity_type: 'payout_batch',
      entity_id: batch.id,
      action: 'create',
      description: `Admin created payout batch ${batchNumber} for period ${period_start_date} to ${period_end_date}`,
      changes: {
        batch_id: batch.id,
        period_start_date,
        period_end_date,
      },
      status: 'success',
      request_id: req.headers['x-request-id'] as string,
    });

    return res.status(201).json({
      id: batch.id,
      batch_number: batch.batch_number,
      period_start_date: batch.period_start_date,
      period_end_date: batch.period_end_date,
      status: batch.status,
      message: 'Payout batch created. Computation of items deferred to P1.5 (payout system implementation).',
      // TODO (P1.5): Return computed totals and items once payout computation is implemented
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Payout batch generation error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

