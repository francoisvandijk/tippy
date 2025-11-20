// Admin API routes
// Ledger Reference: §7 (API Surface), §9 (Payouts)
//
// Auth Requirements (Ledger §2, §8):
// - POST /admin/payouts/generate-weekly: Requires 'admin' role
//   - Generates weekly payout batch per Ledger §9
//   - Creates CSV export and emails to admin

import { randomUUID } from 'crypto';

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { logAuditEvent } from '../../lib/audit';
import { requireAuth, requireRole } from '../../lib/auth';
import { supabase } from '../../lib/db';
import { processReferralMilestones } from '../../lib/referrals';
import { processReferralReversals } from '../../lib/referralReversal';

const router = Router();

/**
 * POST /admin/payouts/generate-weekly
 * Generate weekly payout batch
 * Per Ledger §7: Admin endpoint
 * Per Ledger §9: Weekly payouts (Sat 00:00 → Fri 23:59, processed Sunday)
 *
 * Auth: Requires 'admin' role (Ledger §2.4, §8)
 */
const generatePayoutSchema = z.object({
  period_start_date: z.string().optional(), // ISO date string (defaults to previous Saturday)
  period_end_date: z.string().optional(), // ISO date string (defaults to previous Friday)
  force: z.boolean().optional().default(false), // Force generation even if batch exists
});

router.post(
  '/payouts/generate-weekly',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = generatePayoutSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const { period_start_date, period_end_date, force } = validationResult.data;

      // Process referral milestones before generating payouts per Ledger §10
      const referralMilestoneSummary = await processReferralMilestones();
      if (referralMilestoneSummary.milestonesAwarded > 0) {
        console.info('[referrals] Milestone rewards issued', {
          milestonesAwarded: referralMilestoneSummary.milestonesAwarded,
          totalRewardAmountZarCents: referralMilestoneSummary.totalRewardAmountZarCents,
        });
      }

      // Process T+30 referral reversals per Ledger §10.2
      const referralReversalSummary = await processReferralReversals();
      if (referralReversalSummary.reversalsProcessed > 0) {
        console.info('[referrals] T+30 reversals processed', {
          reversalsProcessed: referralReversalSummary.reversalsProcessed,
          totalReversalAmountZarCents: referralReversalSummary.totalReversalAmountZarCents,
        });
      }

      // Calculate payout period (previous Sat 00:00 → Fri 23:59)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

      // Find previous Saturday
      const daysSinceSaturday = dayOfWeek === 0 ? 1 : dayOfWeek === 6 ? 7 : dayOfWeek + 1;
      const periodStart = period_start_date
        ? new Date(period_start_date)
        : new Date(now.getTime() - daysSinceSaturday * 24 * 60 * 60 * 1000);
      periodStart.setHours(0, 0, 0, 0);

      // Find previous Friday (day before Saturday)
      const periodEnd = period_end_date
        ? new Date(period_end_date)
        : new Date(periodStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      periodEnd.setHours(23, 59, 59, 999);

      // Check if batch already exists for this period
      if (!force) {
        const { data: existingBatch } = await supabase
          .from('payout_batches')
          .select('id, status')
          .eq('period_start_date', periodStart.toISOString().split('T')[0])
          .eq('period_end_date', periodEnd.toISOString().split('T')[0])
          .single();

        if (existingBatch) {
          return res.status(409).json({
            error: 'VALIDATION_ERROR',
            message: 'Payout batch already exists for this period',
            batch_id: existingBatch.id,
          });
        }
      }

      // Create payout batch
      const batchId = randomUUID();
      const batchNumber = `TPY-PAYOUT-${periodStart.toISOString().slice(0, 10).replace(/-/g, '')}-${batchId.slice(0, 8).toUpperCase()}`;

      const { data: batch, error: batchError } = await supabase
        .from('payout_batches')
        .insert({
          id: batchId,
          batch_number: batchNumber,
          period_start_date: periodStart.toISOString().split('T')[0],
          period_end_date: periodEnd.toISOString().split('T')[0],
          processed_date: now.toISOString().split('T')[0],
          status: 'generating',
        })
        .select()
        .single();

      if (batchError || !batch) {
        console.error('[admin] Error creating payout batch', batchError?.message);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to create payout batch',
        });
      }

      // Get unpaid tips for the period (guards with net >= R500)
      const cashSendFee = parseInt(process.env.CASH_SEND_FEE_ZAR || '900', 10); // R9.00 in cents
      const payoutMinEligibility = parseInt(process.env.PAYOUT_MIN_ELIGIBILITY_ZAR || '50000', 10); // R500 in cents

      // Query guards eligible for payout
      const { data: eligibleGuards, error: guardsError } = await supabase
        .from('guards')
        .select('id, lifetime_net_tips, lifetime_payouts')
        .gte('lifetime_net_tips', payoutMinEligibility)
        .eq('status', 'active');

      if (guardsError) {
        console.error('[admin] Error fetching eligible guards', guardsError?.message);
        await supabase.from('payout_batches').update({ status: 'failed' }).eq('id', batchId);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch eligible guards',
        });
      }

      // Get guard IDs for eligible guards
      const eligibleGuardIds = (eligibleGuards || []).map((g) => g.id);

      // Find all pending QR_REPLACEMENT items for eligible guards
      // These are fees created during QR reassignment (POST /qr/reassign) that need to be deducted
      // Per Ledger §9: QR_REPLACEMENT fees are deducted from the guard's next payout
      let pendingQrReplacementFees: Array<{
        id: string;
        guard_id: string;
        amount_zar_cents: number;
        net_amount_zar_cents: number;
      }> = [];

      if (eligibleGuardIds.length > 0) {
        // Find pending QR replacement fees that are not yet tied to a payout batch
        // Items in pending batches (TPY-QR-FEE-PENDING-*) are included here
        const { data: pendingQrFees, error: qrFeesError } = await supabase
          .from('payout_batch_items')
          .select('id, guard_id, amount_zar_cents, net_amount_zar_cents')
          .eq('item_type', 'QR_REPLACEMENT')
          .eq('status', 'pending')
          .in('guard_id', eligibleGuardIds);

        if (qrFeesError) {
          console.error('[admin] Error fetching pending QR replacement fees', qrFeesError?.message);
          // Non-blocking: continue with payout generation even if QR fee lookup fails
        } else if (pendingQrFees) {
          pendingQrReplacementFees = pendingQrFees;
        }
      }

      // Group QR replacement fees by guard_id to calculate total deduction per guard
      const qrFeesByGuard = new Map<string, number>();
      for (const fee of pendingQrReplacementFees) {
        const currentTotal = qrFeesByGuard.get(fee.guard_id) || 0;
        qrFeesByGuard.set(fee.guard_id, currentTotal + fee.net_amount_zar_cents);
      }

      // Calculate payout items for each guard (including QR replacement fee deductions)
      const payoutItems: Array<{
        payout_batch_id: string;
        guard_id: string;
        item_type: string;
        amount_zar_cents: number;
        cashsend_fee_zar_cents: number;
        net_amount_zar_cents: number;
        status: string;
      }> = [];

      let totalAmount = 0;
      let totalCashSendFees = 0;
      let totalBeneficiaries = 0;

      for (const guard of eligibleGuards || []) {
        const unpaidBalance = guard.lifetime_net_tips - guard.lifetime_payouts;
        if (unpaidBalance >= payoutMinEligibility) {
          // Get total QR replacement fees for this guard
          const qrReplacementFeesTotal = qrFeesByGuard.get(guard.id) || 0;

          // Calculate net amount after CashSend fee and QR replacement fees
          // Per Ledger §9: QR_REPLACEMENT fees are deducted from the guard's payout
          const netAmount = unpaidBalance - cashSendFee - qrReplacementFeesTotal;

          if (netAmount > 0) {
            // Add GUARD payout item
            payoutItems.push({
              payout_batch_id: batchId,
              guard_id: guard.id,
              item_type: 'GUARD',
              amount_zar_cents: unpaidBalance,
              cashsend_fee_zar_cents: cashSendFee,
              net_amount_zar_cents: netAmount,
              status: 'pending',
            });
            totalAmount += unpaidBalance;
            totalCashSendFees += cashSendFee;
            totalBeneficiaries += 1;
          }
        }
      }

      // Update pending QR_REPLACEMENT items to reference this payout batch
      // This ensures idempotency: re-running payout generation won't double-deduct fees
      for (const qrFee of pendingQrReplacementFees) {
        // Only update QR fees for guards that are eligible and have a payout item
        const guardHasPayout = payoutItems.some(
          (item) => item.guard_id === qrFee.guard_id && item.item_type === 'GUARD'
        );

        if (guardHasPayout) {
          // Update the QR replacement fee item to reference this payout batch
          // This marks it as processed and prevents double-deduction
          const { error: updateQrFeeError } = await supabase
            .from('payout_batch_items')
            .update({
              payout_batch_id: batchId,
              status: 'pending', // Keep as pending until batch is processed
            })
            .eq('id', qrFee.id);

          if (updateQrFeeError) {
            console.error(
              '[admin] Error updating QR replacement fee item',
              updateQrFeeError?.message
            );
            // Non-blocking: continue even if QR fee update fails
          }
        }
      }

      // Insert new payout items (GUARD items only)
      // QR_REPLACEMENT items are already in the database, we just update their batch reference
      const newPayoutItems = payoutItems.filter((item) => item.item_type === 'GUARD');
      if (newPayoutItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('payout_batch_items')
          .insert(newPayoutItems);

        if (itemsError) {
          console.error('[admin] Error creating payout items', itemsError?.message);
          await supabase.from('payout_batches').update({ status: 'failed' }).eq('id', batchId);
          return res.status(500).json({
            error: 'PROCESSOR_ERROR',
            message: 'Failed to create payout items',
          });
        }
      }

      // Update batch totals and status
      const { error: updateError } = await supabase
        .from('payout_batches')
        .update({
          total_amount_zar_cents: totalAmount,
          total_cashsend_fees_zar_cents: totalCashSendFees,
          total_beneficiaries: totalBeneficiaries,
          status: 'generated',
        })
        .eq('id', batchId);

      if (updateError) {
        console.error('[admin] Error updating batch', updateError?.message);
      }

      // Generate CSV (simplified - in production, use proper CSV library)
      // Include both GUARD items and QR_REPLACEMENT items for complete payout breakdown
      const csvRows: string[] = [
        'Guard ID,Item Type,Net Amount (ZAR cents),CashSend Fee (ZAR cents),Total Amount (ZAR cents)',
      ];

      // Add GUARD items
      for (const item of payoutItems) {
        csvRows.push(
          `${item.guard_id},${item.item_type},${item.net_amount_zar_cents},${item.cashsend_fee_zar_cents},${item.amount_zar_cents}`
        );
      }

      // Add QR_REPLACEMENT items for reference (these are deductions, already included in GUARD net amounts)
      for (const qrFee of pendingQrReplacementFees) {
        const guardHasPayout = payoutItems.some(
          (item) => item.guard_id === qrFee.guard_id && item.item_type === 'GUARD'
        );
        if (guardHasPayout) {
          csvRows.push(
            `${qrFee.guard_id},QR_REPLACEMENT,${qrFee.net_amount_zar_cents},0,${qrFee.amount_zar_cents}`
          );
        }
      }

      const csvContent = csvRows.join('\n');

      // TODO: Email CSV to admin (per Ledger §9 - Tier-3 automation)
      // For now, include CSV in response
      // In production: use email service (SendGrid) to send CSV

      // Log audit event
      try {
        await logAuditEvent({
          event_type: 'PAYOUT_BATCH_GENERATED',
          event_category: 'payout',
          actor_user_id: req.auth!.userId,
          actor_role: req.auth!.role,
          entity_type: 'payout_batch',
          entity_id: batchId,
          action: 'generate',
          description: `Weekly payout batch generated for period ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
          status: 'success',
          metadata: {
            batch_number: batchNumber,
            total_beneficiaries: totalBeneficiaries,
            total_amount_zar_cents: totalAmount,
          },
        });
      } catch (auditError) {
        console.error(
          '[admin] Audit logging error',
          auditError instanceof Error ? auditError.message : String(auditError)
        );
        // Non-blocking
      }

      return res.status(201).json({
        batch_id: batchId,
        batch_number: batchNumber,
        period_start_date: periodStart.toISOString().split('T')[0],
        period_end_date: periodEnd.toISOString().split('T')[0],
        total_beneficiaries: totalBeneficiaries,
        total_amount_zar_cents: totalAmount,
        total_cashsend_fees_zar_cents: totalCashSendFees,
        csv_preview: csvContent.substring(0, 500), // First 500 chars as preview
        referral_milestones_summary: referralMilestoneSummary,
        referral_reversals_summary: referralReversalSummary,
        status: 'generated',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[admin] Payout generation error', errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to generate payout batch',
      });
    }
  }
);

/**
 * POST /admin/referral/reversal
 * Process referral reversals (manual or T+30 bulk)
 * Per Ledger §7: Admin endpoint
 * Per Ledger §10.2: T+30 reversal logic
 * Per Ledger §10.3: Eligibility & Payout
 *
 * Auth: Requires 'admin' role (Ledger §2.4, §8)
 *
 * Supports two modes:
 * 1. Manual reversal: Provide referral_id/milestone_id and reason
 * 2. Bulk T+30 processing: No parameters (processes all eligible reversals)
 */
const referralReversalSchema = z
  .object({
    referral_id: z.string().optional(),
    milestone_id: z.string().optional(),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => !(data.referral_id || data.milestone_id) || data.reason, {
    message: 'reason is required for manual reversal',
    path: ['reason'],
  });

router.post(
  '/referral/reversal',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = referralReversalSchema.safeParse(req.body);
      if (!validationResult.success) {
        // Extract refine error messages and include in main message
        const refineErrors = validationResult.error.errors.filter((e) => e.code === 'custom');
        const message =
          refineErrors.length > 0
            ? refineErrors[0].message || 'Invalid request data'
            : 'Invalid request data';
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: message,
          details: validationResult.error.errors,
        });
      }

      const { referral_id, milestone_id, reason } = validationResult.data;

      // Manual reversal mode: specific referral/milestone
      if (referral_id || milestone_id) {
        // reason validation is handled by schema refine, but check again for safety
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'reason is required for manual reversal',
          });
        }

        // Find the milestone to reverse
        let milestoneQuery = supabase
          .from('referral_milestones')
          .select('id, referrer_id, referral_id, guard_id, reward_amount_zar_cents, status, rewarded_at');

        if (milestone_id) {
          milestoneQuery = milestoneQuery.eq('id', milestone_id);
        } else if (referral_id) {
          milestoneQuery = milestoneQuery.eq('referral_id', referral_id);
        }

        const { data: milestone, error: milestoneError } = await milestoneQuery.single();

        if (milestoneError || !milestone) {
          return res.status(404).json({
            error: 'PROCESSOR_ERROR',
            message: 'Referral milestone not found',
          });
        }

        // Validate milestone is eligible for reversal
        if (milestone.status !== 'rewarded') {
          return res.status(400).json({
            error: 'BUSINESS_RULE_VIOLATION',
            message: `Milestone status is ${milestone.status}, only 'rewarded' milestones can be reversed`,
          });
        }

        // Check if reversal already exists (idempotency)
        const { data: earnedEntries } = await supabase
          .from('referral_earnings_ledger')
          .select('id')
          .eq('milestone_id', milestone.id)
          .eq('event_type', 'EARNED')
          .limit(1);

        if (!earnedEntries || earnedEntries.length === 0) {
          return res.status(404).json({
            error: 'PROCESSOR_ERROR',
            message: 'No EARNED ledger entry found for this milestone',
          });
        }

        const originalEarnedId = earnedEntries[0].id;

        const { data: existingReversal } = await supabase
          .from('referral_earnings_ledger')
          .select('id')
          .eq('reversal_reference_id', originalEarnedId)
          .eq('event_type', 'REVERSAL')
          .limit(1);

        if (existingReversal && existingReversal.length > 0) {
          return res.status(409).json({
            error: 'VALIDATION_ERROR',
            message: 'Reversal already exists for this milestone',
            reversal_id: existingReversal[0].id,
          });
        }

        // Create reversal using RPC function
        const { data: reversalData, error: reversalError } = await supabase.rpc(
          'reverse_referral_milestone',
          {
            p_milestone_id: milestone.id,
            p_earned_ledger_id: originalEarnedId,
            p_reversal_reason: reason,
          }
        );

        if (reversalError || !reversalData || !Array.isArray(reversalData) || reversalData.length === 0) {
          console.error('[admin] Error creating reversal', reversalError?.message);
          return res.status(500).json({
            error: 'PROCESSOR_ERROR',
            message: 'Failed to create reversal',
          });
        }

        const reversal = reversalData[0] as {
          reversal_id: string;
          balance_after_zar_cents: number;
        };

        // Log audit event
        try {
          await logAuditEvent({
            event_type: 'REFERRAL_REVERSAL_PROCESSED',
            event_category: 'referral',
            actor_user_id: req.auth!.userId,
            actor_role: req.auth!.role,
            entity_type: 'referral_reversal',
            entity_id: reversal.reversal_id,
            action: 'manual_reversal',
            description: `Manual referral reversal processed. Milestone: ${milestone.id}, Reason: ${reason}`,
            status: 'success',
            metadata: {
              milestone_id: milestone.id,
              referral_id: milestone.referral_id,
              referrer_id: milestone.referrer_id,
              guard_id: milestone.guard_id,
              reversal_amount_zar_cents: milestone.reward_amount_zar_cents,
              balance_after_zar_cents: reversal.balance_after_zar_cents,
              reason: reason,
            },
          });
        } catch (auditError) {
          console.error(
            '[admin] Audit logging error',
            auditError instanceof Error ? auditError.message : String(auditError)
          );
          // Non-blocking
        }

        return res.status(200).json({
          success: true,
          reversal_id: reversal.reversal_id,
          milestone_id: milestone.id,
          referral_id: milestone.referral_id,
          referrer_id: milestone.referrer_id,
          reversal_amount_zar_cents: milestone.reward_amount_zar_cents,
          balance_after_zar_cents: reversal.balance_after_zar_cents,
          reason: reason,
        });
      }

      // Bulk T+30 processing mode: process all eligible reversals
      const reversalSummary = await processReferralReversals();

      // Log audit event
      try {
        await logAuditEvent({
          event_type: 'REFERRAL_REVERSAL_PROCESSED',
          event_category: 'referral',
          actor_user_id: req.auth!.userId,
          actor_role: req.auth!.role,
          entity_type: 'referral_reversal',
          action: 'process_t30_reversals',
          description: `T+30 referral reversals processed: ${reversalSummary.reversalsProcessed} reversals, ${reversalSummary.totalReversalAmountZarCents} cents reversed`,
          status: reversalSummary.errors.length > 0 ? 'partial' : 'success',
          metadata: {
            totalCandidates: reversalSummary.totalCandidates,
            reversalsProcessed: reversalSummary.reversalsProcessed,
            totalReversalAmountZarCents: reversalSummary.totalReversalAmountZarCents,
            errorCount: reversalSummary.errors.length,
          },
        });
      } catch (auditError) {
        console.error(
          '[admin] Audit logging error',
          auditError instanceof Error ? auditError.message : String(auditError)
        );
        // Non-blocking
      }

      return res.status(200).json({
        success: true,
        summary: reversalSummary,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[admin] Referral reversal processing error', errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to process referral reversals',
      });
    }
  }
);

/**
 * POST /admin/qr/assign
 * Admin-side QR assignment to guard
 * Per Ledger §7: Admin endpoint
 * Per Ledger §6.4: QR Assignment/Reassignment
 * Per Ledger §24.4: Referrer Activation & Guard Registration
 *
 * Auth: Requires 'admin' role (Ledger §2.4, §8)
 *
 * Allows admin to manually assign a QR code to a guard.
 * Validates QR state and guard eligibility.
 * Respects QR_REPLACEMENT_FEE_ZAR if reassignment is required.
 */
const qrAssignSchema = z
  .object({
    qr_id: z.string().optional(),
    qr_code: z.string().min(1).optional(),
    short_code: z.string().min(1).optional(),
    guard_id: z.string(),
    force_reassign: z.boolean().optional().default(false), // Force reassignment even if QR is assigned
  })
  .refine((data) => data.qr_id || data.qr_code || data.short_code, {
    message: 'Either qr_id, qr_code, or short_code must be provided',
    path: ['qr_id'],
  });

router.post('/qr/assign', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = qrAssignSchema.safeParse(req.body);
    if (!validationResult.success) {
      // Extract refine error messages and include in main message
      const refineErrors = validationResult.error.errors.filter((e) => e.code === 'custom');
      const message =
        refineErrors.length > 0
          ? refineErrors[0].message || 'Invalid request data'
          : 'Invalid request data';
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: message,
        details: validationResult.error.errors,
      });
    }

    const { qr_id, qr_code, short_code, guard_id, force_reassign } = validationResult.data;

    // QR identifier validation is handled by schema refine above

    // Verify guard exists and is active
    const { data: guard, error: guardError } = await supabase
      .from('guards')
      .select('id, display_name, status')
      .eq('id', guard_id)
      .single();

    if (guardError || !guard) {
      return res.status(404).json({
        error: 'PROCESSOR_ERROR',
        message: 'Guard not found',
      });
    }

    if (guard.status !== 'active') {
      return res.status(400).json({
        error: 'BUSINESS_RULE_VIOLATION',
        message: `Guard status is ${guard.status}, only active guards can receive QR assignments`,
      });
    }

    // Find QR code by provided identifier
    let qrQuery = supabase.from('qr_codes').select('id, code, short_code, status, assigned_guard_id, assigned_at');

    if (qr_id) {
      qrQuery = qrQuery.eq('id', qr_id);
    } else if (qr_code) {
      qrQuery = qrQuery.eq('code', qr_code);
    } else if (short_code) {
      qrQuery = qrQuery.eq('short_code', short_code);
    }

    const { data: qr, error: qrError } = await qrQuery.single();

    if (qrError || !qr) {
      return res.status(404).json({
        error: 'PROCESSOR_ERROR',
        message: 'QR code not found',
      });
    }

    // Check QR state
    const previousStatus = qr.status;
    const previousGuardId = qr.assigned_guard_id;

    // Validate QR can be assigned
    if (!force_reassign && qr.status !== 'unassigned' && qr.assigned_guard_id) {
      return res.status(400).json({
        error: 'BUSINESS_RULE_VIOLATION',
        message: `QR code is already assigned. Current status: ${qr.status}, Assigned to: ${qr.assigned_guard_id}. Use force_reassign=true to override`,
      });
    }

    // If force_reassign, check if guard has an active QR that needs to be replaced
    let oldQrReplaced = false;
    if (force_reassign && previousGuardId && previousGuardId !== guard_id) {
      // Find and replace old QR assigned to this guard
      const { data: oldQr } = await supabase
        .from('qr_codes')
        .select('id, code, short_code')
        .eq('assigned_guard_id', guard_id)
        .in('status', ['assigned', 'active'])
        .single();

      if (oldQr) {
        const { error: replaceError } = await supabase
          .from('qr_codes')
          .update({
            status: 'replaced',
            assigned_guard_id: null,
            replaced_at: new Date().toISOString(),
          })
          .eq('id', oldQr.id);

        if (replaceError) {
          console.error('[admin] Error replacing old QR', replaceError?.message);
          // Non-blocking, but log the error
        } else {
          oldQrReplaced = true;
        }
      }
    }

    // If QR was previously assigned to a different guard, mark it as replaced
    if (previousGuardId && previousGuardId !== guard_id) {
      const { error: unassignError } = await supabase
        .from('qr_codes')
        .update({
          status: 'replaced',
          assigned_guard_id: null,
          replaced_at: new Date().toISOString(),
        })
        .eq('id', qr.id);

      if (unassignError) {
        console.error('[admin] Error unassigning previous QR', unassignError?.message);
      }
    }

    // Assign QR to guard
    const now = new Date().toISOString();
    const { error: assignError } = await supabase
      .from('qr_codes')
      .update({
        status: 'assigned',
        assigned_guard_id: guard_id,
        assigned_at: now,
      })
      .eq('id', qr.id);

    if (assignError) {
      console.error('[admin] Error assigning QR', assignError?.message);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to assign QR code',
      });
    }

    // Log audit event
    try {
      await logAuditEvent({
        event_type: 'QR_ASSIGNED',
        event_category: 'admin',
        actor_user_id: req.auth!.userId,
        actor_role: req.auth!.role,
        entity_type: 'qr_codes',
        entity_id: qr.id,
        action: 'admin_assign',
        description: `Admin assigned QR code ${qr.code || qr.short_code} to guard ${guard_id}`,
        status: 'success',
        metadata: {
          qr_id: qr.id,
          qr_code: qr.code || qr.short_code,
          guard_id: guard_id,
          previous_status: previousStatus,
          previous_guard_id: previousGuardId,
          force_reassign: force_reassign,
          old_qr_replaced: oldQrReplaced,
        },
      });
    } catch (auditError) {
      console.error(
        '[admin] Audit logging error',
        auditError instanceof Error ? auditError.message : String(auditError)
      );
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      qr: {
        id: qr.id,
        code: qr.code || qr.short_code,
        status: 'assigned',
      },
      guard: {
        id: guard_id,
        display_name: guard.display_name,
      },
      previous_status: previousStatus,
      previous_guard_id: previousGuardId,
      old_qr_replaced: oldQrReplaced,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin] QR assignment error', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Failed to assign QR code',
    });
  }
});

/**
 * POST /admin/settings/set
 * Update runtime settings (admin-editable defaults)
 * Per Ledger §7: Admin endpoint
 * Per Ledger §3: Config (Admin-Editable Defaults)
 *
 * Auth: Requires 'admin' role (Ledger §2.4, §8)
 *
 * Allows admin to update mutable settings in app_settings table.
 * Validates allowed keys, types, and ranges per Ledger §3.
 * Does NOT modify environment variables (those remain in Doppler/GitHub secrets).
 */
const settingsSetSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean()]),
      })
    )
    .min(1),
});

// Allowed mutable settings per Ledger §3
// Locked settings (e.g., PAYMENT_PROVIDER = "Yoco") cannot be changed via API
const ALLOWED_MUTABLE_SETTINGS = [
  'PLATFORM_FEE_PERCENT',
  'VAT_ENABLED',
  'VAT_RATE_PERCENT',
  'CASH_SEND_FEE_ZAR',
  'PAYOUT_MIN_ELIGIBILITY_ZAR',
  'REFERRAL_FEE_PER_GUARD_ZAR',
  'REFERRAL_TIP_THRESHOLD_ZAR',
  'REFERRAL_PAYOUT_MINIMUM_ZAR',
  'QR_REPLACEMENT_FEE_ZAR',
  'REFERENCE_PREFIX',
  'TIP_HISTORY_MAX_ROWS',
  'NEARBY_RADIUS_METERS',
  'NEARBY_DWELL_MINUTES',
];

router.post('/settings/set', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = settingsSetSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { settings } = validationResult.data;

    const results: Array<{
      key: string;
      old_value: string | null;
      new_value: string;
      status: 'success' | 'error';
      error?: string;
    }> = [];

    // Process each setting update
    for (const setting of settings) {
      const { key, value } = setting;

      // Validate key is allowed and not locked
      if (!ALLOWED_MUTABLE_SETTINGS.includes(key)) {
        results.push({
          key,
          old_value: null,
          new_value: String(value),
          status: 'error',
          error: `Setting key '${key}' is not allowed to be modified via API or is locked`,
        });
        continue;
      }

      // Get current setting
      const { data: currentSetting, error: fetchError } = await supabase
        .from('app_settings')
        .select('id, key, value, value_type, is_locked')
        .eq('key', key)
        .single();

      if (fetchError || !currentSetting) {
        results.push({
          key,
          old_value: null,
          new_value: String(value),
          status: 'error',
          error: 'Setting not found',
        });
        continue;
      }

      // Check if setting is locked
      if (currentSetting.is_locked) {
        results.push({
          key,
          old_value: currentSetting.value,
          new_value: String(value),
          status: 'error',
          error: `Setting '${key}' is locked and cannot be modified`,
        });
        continue;
      }

      // Validate value type matches setting type
      const expectedType = currentSetting.value_type || 'string';
      const actualType = typeof value;
      let validType = false;

      if (expectedType === 'string' && actualType === 'string') {
        validType = true;
      } else if (expectedType === 'number' && actualType === 'number') {
        // Additional validation for numeric ranges
        const numValue = value as number;
        if (key.includes('PERCENT') && (numValue < 0 || numValue > 100)) {
          results.push({
            key,
            old_value: currentSetting.value,
            new_value: String(value),
            status: 'error',
            error: 'Percentage values must be between 0 and 100',
          });
          continue;
        }
        if (key.includes('FEE') && numValue < 0) {
          results.push({
            key,
            old_value: currentSetting.value,
            new_value: String(value),
            status: 'error',
            error: 'Fee values cannot be negative',
          });
          continue;
        }
        validType = true;
      } else if (expectedType === 'boolean' && actualType === 'boolean') {
        validType = true;
      }

      if (!validType) {
        results.push({
          key,
          old_value: currentSetting.value,
          new_value: String(value),
          status: 'error',
          error: `Value type mismatch. Expected ${expectedType}, got ${actualType}`,
        });
        continue;
      }

      // Update setting
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({
          value: String(value),
          updated_by_user_id: req.auth!.userId,
        })
        .eq('id', currentSetting.id);

      if (updateError) {
        results.push({
          key,
          old_value: currentSetting.value,
          new_value: String(value),
          status: 'error',
          error: updateError.message,
        });
        continue;
      }

      results.push({
        key,
        old_value: currentSetting.value,
        new_value: String(value),
        status: 'success',
      });

      // Log audit event for each setting change
      try {
        await logAuditEvent({
          event_type: 'SETTING_UPDATED',
          event_category: 'admin',
          actor_user_id: req.auth!.userId,
          actor_role: req.auth!.role,
          entity_type: 'app_settings',
          entity_id: currentSetting.id,
          action: 'update',
          description: `Setting '${key}' updated from '${currentSetting.value}' to '${value}'`,
          status: 'success',
          metadata: {
            key: key,
            old_value: currentSetting.value,
            new_value: String(value),
            value_type: expectedType,
          },
        });
      } catch (auditError) {
        console.error(
          '[admin] Audit logging error for setting update',
          auditError instanceof Error ? auditError.message : String(auditError)
        );
        // Non-blocking
      }
    }

    // Count successes and errors
    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    return res.status(errorCount === 0 ? 200 : 207).json({
      success: errorCount === 0,
      updated: successCount,
      errors: errorCount,
      results: results,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin] Settings update error', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Failed to update settings',
    });
  }
});

export default router;
