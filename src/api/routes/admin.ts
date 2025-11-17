// Admin API routes
// Ledger Reference: §7 (API Surface), §9 (Payouts)
//
// Auth Requirements (Ledger §2, §8):
// - POST /admin/payouts/generate-weekly: Requires 'admin' role
//   - Generates weekly payout batch per Ledger §9
//   - Creates CSV export and emails to admin

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/db';
import { requireAuth, requireRole } from '../../lib/auth';
import { logAuditEvent } from '../../lib/audit';
import { calculateFees } from '../../lib/fees';
import { randomUUID } from 'crypto';

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
        console.error("[admin] Error creating payout batch", batchError?.message);
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
        console.error("[admin] Error fetching eligible guards", guardsError?.message);
        await supabase
          .from('payout_batches')
          .update({ status: 'failed' })
          .eq('id', batchId);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch eligible guards',
        });
      }

      // Calculate payout items for each guard
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
          const netAmount = unpaidBalance - cashSendFee;
          if (netAmount > 0) {
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

      // Insert payout items
      if (payoutItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('payout_batch_items')
          .insert(payoutItems);

        if (itemsError) {
          console.error("[admin] Error creating payout items", itemsError?.message);
          await supabase
            .from('payout_batches')
            .update({ status: 'failed' })
            .eq('id', batchId);
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
        console.error("[admin] Error updating batch", updateError?.message);
      }

      // Generate CSV (simplified - in production, use proper CSV library)
      const csvRows: string[] = [
        'Guard ID,Net Amount (ZAR cents),CashSend Fee (ZAR cents),Total Amount (ZAR cents)',
      ];
      
      for (const item of payoutItems) {
        csvRows.push(
          `${item.guard_id},${item.net_amount_zar_cents},${item.cashsend_fee_zar_cents},${item.amount_zar_cents}`
        );
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
        console.error("[admin] Audit logging error", auditError instanceof Error ? auditError.message : String(auditError));
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
        status: 'generated',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[admin] Payout generation error", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to generate payout batch',
      });
    }
  }
);

export default router;

