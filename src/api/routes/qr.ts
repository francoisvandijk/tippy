// QR Code API routes
// Ledger Reference: §7 (API Surface), §6.4 (QR Assignment/Reassignment)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/db';
import { maskPhoneNumber, hashPhoneNumber } from '../../lib/utils';
import { logAuditEvent } from '../../lib/audit';

const router = Router();

// Validation schema
const reassignQrSchema = z.object({
  guard_id: z.string().uuid(),
  qr_code_id: z.string().uuid(),
});

/**
 * POST /qr/reassign
 * Guard reassigns to a new QR code
 * Per Ledger §7: Guard endpoint
 * Per Ledger §6.4: QR Assignment / Reassignment workflow
 */
router.post('/reassign', async (req: Request, res: Response) => {
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

    const { guard_id, qr_code_id } = validationResult.data;

    // TODO: Verify guard authentication (P1.6)
    // For now, verify guard exists
    const { data: guard, error: guardError } = await supabase
      .from('guards')
      .select('id, msisdn, status')
      .eq('id', guard_id)
      .single();

    if (guardError || !guard) {
      return res.status(404).json({
        error: 'VALIDATION_ERROR',
        message: 'Guard not found',
      });
    }

    if (guard.status !== 'active') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Guard must be active to reassign QR code',
      });
    }

    // Verify QR code exists and is unassigned or assignable
    const { data: qrCode, error: qrError } = await supabase
      .from('qr_codes')
      .select('id, code, status, assigned_guard_id')
      .eq('id', qr_code_id)
      .single();

    if (qrError || !qrCode) {
      return res.status(404).json({
        error: 'VALIDATION_ERROR',
        message: 'QR code not found',
      });
    }

    if (qrCode.status === 'assigned' && qrCode.assigned_guard_id !== guard_id) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'QR code is already assigned to another guard',
      });
    }

    // Check if guard already has an active QR code (one active per guard per Ledger §6.4)
    const { data: existingActiveQr } = await supabase
      .from('qr_codes')
      .select('id, code')
      .eq('assigned_guard_id', guard_id)
      .eq('status', 'active')
      .single();

    // Use a transaction-like approach (Supabase doesn't support explicit transactions via JS client)
    // Mark old QR as replaced if it exists
    if (existingActiveQr && existingActiveQr.id !== qr_code_id) {
      const { error: oldQrError } = await supabase
        .from('qr_codes')
        .update({
          status: 'replaced',
          replaced_at: new Date().toISOString(),
        })
        .eq('id', existingActiveQr.id);

      if (oldQrError) {
        console.error('Error updating old QR code:', oldQrError);
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to update existing QR code',
        });
      }
    }

    // Assign new QR code
    const { data: updatedQr, error: assignError } = await supabase
      .from('qr_codes')
      .update({
        assigned_guard_id: guard_id,
        status: 'active',
        assigned_at: new Date().toISOString(),
        replaced_at: null,
      })
      .eq('id', qr_code_id)
      .select()
      .single();

    if (assignError) {
      console.error('Error assigning QR code:', assignError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to assign QR code',
      });
    }

    // Log audit event
    await logAuditEvent({
      event_type: 'qr_reassigned',
      event_category: 'admin',
      actor_user_id: guard_id, // TODO: Get from auth token (P1.6)
      actor_role: 'guard',
      entity_type: 'qr_code',
      entity_id: qr_code_id,
      action: 'reassign',
      description: `Guard ${maskPhoneNumber(guard.msisdn)} reassigned QR code ${qr_code_id}`,
      changes: {
        old_qr_id: existingActiveQr?.id || null,
        new_qr_id: qr_code_id,
      },
      status: 'success',
      request_id: req.headers['x-request-id'] as string,
    });

    return res.status(200).json({
      id: updatedQr.id,
      code: updatedQr.code,
      short_code: updatedQr.short_code,
      assigned_guard_id: updatedQr.assigned_guard_id,
      status: updatedQr.status,
      assigned_at: updatedQr.assigned_at,
      previous_qr_id: existingActiveQr?.id || null,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('QR reassignment error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

