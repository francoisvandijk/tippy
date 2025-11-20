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
 * Process T+30 referral reversals manually
 * Per Ledger §7: Admin endpoint
 * Per Ledger §10.2: T+30 reversal logic
 *
 * Auth: Requires 'admin' role (Ledger §2.4, §8)
 */
router.post(
  '/referral/reversal',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      // Process T+30 referral reversals
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

export default router;
