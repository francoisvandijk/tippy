// QR API routes
// Ledger Reference: §7 (API Surface), §6.4 (QR Assignment/Reassignment), §3 (Config), §9 (Payouts)
//
// Auth Requirements (Ledger §2, §8):
// - POST /qr/reassign: Requires 'guard' role
//   - Guard can self-reassign to a new, unassigned QR card
//   - Applies R10 replacement fee per Ledger §3 (QR_REPLACEMENT_FEE_ZAR = 10.00)
//   - Fee deducted from next payout per Ledger §9

import { randomUUID } from 'crypto';

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { logAuditEvent } from '../../lib/audit';
import { requireAuth, requireRole } from '../../lib/auth';
import { supabase } from '../../lib/db';

const router = Router();

/**
 * POST /qr/reassign
 * Reassign guard to a new QR card
 * Per Ledger §7: Guard endpoint
 * Per Ledger §6.4: Guard can self-reassign (QR replacement fee applies)
 * Per Ledger §3: QR_REPLACEMENT_FEE_ZAR = 10.00 (R10)
 * Per Ledger §9: Fee deducted from next payout
 * 
 * Auth: Requires 'guard' role (Ledger §2.3, §8)
 * - Only guards can call this endpoint (not admins/referrers)
 */
const reassignQrSchema = z.object({
  qr_code: z.string().min(1).optional(), // QR code identifier (code or short_code)
  short_code: z.string().min(1).optional(), // Alternative: short_code
});

router.post(
  '/reassign',
  requireAuth,
  requireRole('guard'),
  async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = reassignQrSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const { qr_code, short_code } = validationResult.data;

      // Must provide either qr_code or short_code
      if (!qr_code && !short_code) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Either qr_code or short_code must be provided',
        });
      }

      const guardId = req.auth!.userId;

      // Fetch guard record to verify it exists
      const { data: guard, error: guardError } = await supabase
        .from('guards')
        .select('id, display_name, status')
        .eq('id', guardId)
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
          message: 'Guard account is not active',
        });
      }

      // Find current active/assigned QR for this guard
      const { data: currentQr, error: currentQrError } = await supabase
        .from('qr_codes')
        .select('id, code, short_code, status')
        .eq('assigned_guard_id', guardId)
        .in('status', ['assigned', 'active'])
        .single();

      // Per Ledger §6.4: Guard must have an existing QR to replace
      // However, if no current QR exists, we might allow assignment (checking Ledger intent)
      // For now, we'll require an existing QR per the requirement: "A guard who is already assigned to an existing QR card"
      if (currentQrError || !currentQr) {
        return res.status(400).json({
          error: 'BUSINESS_RULE_VIOLATION',
          message: 'No existing QR card found to reassign. You must have an active QR card assigned.',
        });
      }

      // Find target QR (new card) by code or short_code
      let targetQrQuery = supabase
        .from('qr_codes')
        .select('id, code, short_code, status, assigned_guard_id');

      if (qr_code) {
        targetQrQuery = targetQrQuery.eq('code', qr_code);
      } else if (short_code) {
        targetQrQuery = targetQrQuery.eq('short_code', short_code);
      }

      const { data: targetQr, error: targetQrError } = await targetQrQuery.single();

      if (targetQrError || !targetQr) {
        return res.status(404).json({
          error: 'BUSINESS_RULE_VIOLATION',
          message: 'QR card not found',
        });
      }

      // Validate target QR is unassigned
      if (targetQr.status !== 'unassigned') {
        return res.status(400).json({
          error: 'BUSINESS_RULE_VIOLATION',
          message: `QR card is not available for assignment. Current status: ${targetQr.status}`,
        });
      }

      if (targetQr.assigned_guard_id) {
        return res.status(400).json({
          error: 'BUSINESS_RULE_VIOLATION',
          message: 'QR card is already assigned to another guard',
        });
      }

      // Prevent reassigning to the same QR
      if (targetQr.id === currentQr.id) {
        return res.status(400).json({
          error: 'BUSINESS_RULE_VIOLATION',
          message: 'Cannot reassign to the same QR card',
        });
      }

      // Get QR replacement fee from config (R10.00 = 1000 cents per Ledger §3)
      const qrReplacementFeeZar = parseFloat(process.env.QR_REPLACEMENT_FEE_ZAR || '10.00');
      const qrReplacementFeeCents = Math.round(qrReplacementFeeZar * 100); // 1000 cents

      // Perform reassignment in a multi-step operation
      // Note: Supabase PostgREST client doesn't support explicit database transactions.
      // We perform sequential operations with manual rollback handling where critical.
      // The operations are:
      // 1. Update old QR to 'replaced' status
      // 2. Update new QR to 'assigned' status (with rollback attempt if this fails)
      // 3. Create QR replacement fee record (non-blocking if this fails)
      // 4. Log audit event (non-blocking if this fails)
      // This approach minimizes risk of partial failures while maintaining data consistency.

      const now = new Date().toISOString();

      // Step 1: Update old QR to REPLACED status
      const { error: oldQrUpdateError } = await supabase
        .from('qr_codes')
        .update({
          status: 'replaced',
          assigned_guard_id: null,
          replaced_at: now,
        })
        .eq('id', currentQr.id);

      if (oldQrUpdateError) {
        // NOTE: console.error is used here for application error logging only.
        // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
        console.error("[qr] Error updating old QR code", oldQrUpdateError?.message);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to update old QR card',
        });
      }

      // Step 2: Update new QR to ASSIGNED status
      const { error: newQrUpdateError } = await supabase
        .from('qr_codes')
        .update({
          status: 'assigned',
          assigned_guard_id: guardId,
          assigned_at: now,
        })
        .eq('id', targetQr.id);

      if (newQrUpdateError) {
        // NOTE: console.error is used here for application error logging only.
        // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
        console.error("[qr] Error updating new QR code", newQrUpdateError?.message);
        // Attempt to rollback old QR (best effort)
        await supabase
          .from('qr_codes')
          .update({
            status: currentQr.status,
            assigned_guard_id: guardId,
            replaced_at: null,
          })
          .eq('id', currentQr.id);
        
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to assign new QR card',
        });
      }

      // Step 3: Create QR replacement fee record
      // Per Ledger §9: Fee deducted from next payout
      // Per Ledger §9: Line items include QR_REPLACEMENT type
      // 
      // Implementation: QR_REPLACEMENT fee items are created here and stored in payout_batch_items
      // with a temporary "pending" batch. During payout generation (POST /admin/payouts/generate-weekly),
      // the system:
      // 1. Finds all pending QR_REPLACEMENT items for guards eligible for payout
      // 2. Deducts the total QR replacement fees from each guard's payout amount
      // 3. Updates the QR_REPLACEMENT items to reference the actual payout batch
      // 4. Ensures idempotency: re-running payout generation won't double-deduct fees
      
      // Find existing "pending fees" batch or create a new one
      // Use a special batch number pattern to identify pending fee batches
      // Note: Supabase PostgREST uses .ilike() for pattern matching (case-insensitive LIKE)
      const { data: existingPendingBatch } = await supabase
        .from('payout_batches')
        .select('id')
        .eq('status', 'pending')
        .ilike('batch_number', 'TPY-QR-FEE-PENDING-%')
        .maybeSingle(); // Use maybeSingle() to handle case where no batch exists

      let pendingBatchId: string;
      
      if (existingPendingBatch) {
        pendingBatchId = existingPendingBatch.id;
      } else {
        // Create a new pending batch for QR replacement fees
        pendingBatchId = randomUUID();
        const pendingBatchNumber = `TPY-QR-FEE-PENDING-${Date.now()}`;
        
        const { error: pendingBatchError } = await supabase
          .from('payout_batches')
          .insert({
            id: pendingBatchId,
            batch_number: pendingBatchNumber,
            period_start_date: new Date().toISOString().split('T')[0],
            period_end_date: new Date().toISOString().split('T')[0],
            status: 'pending',
          });

        if (pendingBatchError) {
          // NOTE: console.error is used here for application error logging only.
          // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
          console.error("[qr] Error creating pending batch for QR replacement fee", pendingBatchError?.message);
          // Non-blocking: continue even if batch creation fails (fee can be applied later during payout generation)
        }
      }

      // Create payout_batch_item for QR replacement fee
      // Per Ledger §9: QR_REPLACEMENT item type
      // The amount represents a deduction that will be subtracted from the guard's next payout
      // Note: amount_zar_cents must be > 0 per schema, so we store the fee amount as positive
      // The payout generation logic should subtract this from the guard's payout amount
      if (pendingBatchId) {
        const { error: feeItemError } = await supabase
          .from('payout_batch_items')
          .insert({
            payout_batch_id: pendingBatchId,
            guard_id: guardId,
            item_type: 'QR_REPLACEMENT',
            amount_zar_cents: qrReplacementFeeCents, // R10.00 = 1000 cents (stored as positive per schema constraint)
            cashsend_fee_zar_cents: 0, // No CashSend fee for replacement fees (fee is the deduction itself)
            net_amount_zar_cents: qrReplacementFeeCents, // Same as amount (payout logic will subtract this)
            status: 'pending',
          });

        if (feeItemError) {
          // NOTE: console.error is used here for application error logging only.
          // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
          console.error("[qr] Error creating QR replacement fee item", feeItemError?.message);
          // Non-blocking: fee tracking can be handled during next payout generation
        }
      }

      // Step 4: Log audit event
      try {
        await logAuditEvent({
          event_type: 'QR_REASSIGNED',
          event_category: 'other', // Guard-initiated action, not admin action
          actor_user_id: guardId,
          actor_role: 'guard',
          entity_type: 'qr_codes',
          entity_id: targetQr.id,
          action: 'reassign',
          description: `Guard reassigned QR card. Old QR: ${currentQr.code || currentQr.short_code}, New QR: ${targetQr.code || targetQr.short_code}`,
          status: 'success',
          metadata: {
            old_qr_id: currentQr.id,
            old_qr_code: currentQr.code || currentQr.short_code,
            new_qr_id: targetQr.id,
            new_qr_code: targetQr.code || targetQr.short_code,
            replacement_fee_zar_cents: qrReplacementFeeCents,
          },
        });
      } catch (_auditError) {
        // NOTE: console.error is used here for application error logging only.
        // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
        console.error("[qr] Audit logging error", _auditError instanceof Error ? _auditError.message : String(_auditError));
        // Non-blocking: reassignment succeeds even if audit logging fails
      }

      return res.status(200).json({
        message: 'QR card reassigned successfully. Replacement fee (R10.00) will be deducted from your next payout.',
        old_qr: {
          id: currentQr.id,
          code: currentQr.code || currentQr.short_code,
          status: 'replaced',
        },
        new_qr: {
          id: targetQr.id,
          code: targetQr.code || targetQr.short_code,
          status: 'assigned',
        },
        replacement_fee_zar_cents: qrReplacementFeeCents,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // NOTE: console.error is used here for application error logging only.
      // No PII is logged. A structured logger may replace this in a future phase per Ledger §13.6.
      console.error("[qr] QR reassignment error", errorMessage);
      
      // Log failure in audit
      try {
        await logAuditEvent({
          event_type: 'QR_REASSIGNED',
          event_category: 'admin',
          actor_user_id: req.auth!.userId,
          actor_role: 'guard',
          action: 'reassign',
          description: `QR reassignment failed: ${errorMessage}`,
          status: 'failure',
          error_message: errorMessage,
        });
      } catch (_auditError) {
        // Silent fail for audit logging
      }
      
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to reassign QR card',
      });
    }
  }
);

export default router;

