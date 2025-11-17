// Admin QR Code API routes
// Ledger Reference: §7 (API Surface), §24.5 (Bulk QR Generation)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../../lib/db';
import { maskPhoneNumber } from '../../../lib/utils';
import { logAuditEvent } from '../../../lib/audit';
import { randomUUID } from 'crypto';

const router = Router();

// Validation schemas
const assignQrSchema = z.object({
  qr_code_id: z.string().uuid(),
  guard_id: z.string().uuid(),
});

const bulkGenerateQrSchema = z.object({
  batch_name: z.string().min(1).max(255),
  batch_type: z.enum(['guard', 'referrer', 'mixed']),
  qr_design_id: z.string().uuid().optional(),
  quantity: z.number().int().positive().max(1000), // Max 1000 QR codes per batch
});

/**
 * POST /admin/qr/assign
 * Admin assigns a QR code to a guard
 * Per Ledger §7: Admin endpoint
 */
router.post('/assign', async (req: Request, res: Response) => {
  try {
    // TODO: Verify admin authentication (P1.6)
    // For now, accept admin_user_id in request (temporary)
    const adminUserId = req.body.admin_user_id as string;

    // Validate request body
    const validationResult = assignQrSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { qr_code_id, guard_id } = validationResult.data;

    // Verify guard exists
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

    // Verify QR code exists
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
      .select('id')
      .eq('assigned_guard_id', guard_id)
      .eq('status', 'active')
      .single();

    // Mark old QR as replaced if it exists
    if (existingActiveQr && existingActiveQr.id !== qr_code_id) {
      await supabase
        .from('qr_codes')
        .update({
          status: 'replaced',
          replaced_at: new Date().toISOString(),
        })
        .eq('id', existingActiveQr.id);
    }

    // Assign QR code
    const { data: updatedQr, error: assignError } = await supabase
      .from('qr_codes')
      .update({
        assigned_guard_id: guard_id,
        status: 'active',
        assigned_at: new Date().toISOString(),
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
      event_type: 'qr_assigned_by_admin',
      event_category: 'admin',
      actor_user_id: adminUserId,
      actor_role: 'admin',
      entity_type: 'qr_code',
      entity_id: qr_code_id,
      action: 'assign',
      description: `Admin assigned QR code ${qr_code_id} to guard ${maskPhoneNumber(guard.msisdn)}`,
      changes: {
        guard_id,
        qr_code_id,
        previous_qr_id: existingActiveQr?.id || null,
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
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('QR assignment error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /admin/qr/bulk-generate
 * Create a batch of QR codes (skeleton - PDF/image generation deferred)
 * Per Ledger §7: Admin endpoint (Tier-3)
 */
router.post('/bulk-generate', async (req: Request, res: Response) => {
  try {
    // TODO: Verify admin authentication (P1.6)
    const adminUserId = req.body.admin_user_id as string;

    // Validate request body
    const validationResult = bulkGenerateQrSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { batch_name, batch_type, qr_design_id, quantity } = validationResult.data;

    // Get or use default QR design
    let designId = qr_design_id;
    if (!designId) {
      const { data: defaultDesign } = await supabase
        .from('qr_designs')
        .select('id')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (defaultDesign) {
        designId = defaultDesign.id;
      }
    }

    // Create QR batch
    const batchNumber = `QR-BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    
    const { data: batch, error: batchError } = await supabase
      .from('qr_batches')
      .insert({
        batch_number: batchNumber,
        batch_name: batch_name,
        batch_type: batch_type,
        qr_design_id: designId || null,
        status: 'generating',
        total_qr_codes: quantity,
        created_by_user_id: adminUserId || null,
      })
      .select()
      .single();

    if (batchError) {
      console.error('Error creating QR batch:', batchError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to create QR batch',
      });
    }

    // Generate QR codes (basic - just create records, no actual QR image generation yet)
    const qrCodes = [];
    for (let i = 0; i < quantity; i++) {
      const qrId = randomUUID();
      const shortCode = Math.random().toString(36).substring(2, 12).toUpperCase(); // 10 char short code
      const fullCode = `https://www.tippypay.co.za/t/${shortCode}`; // Per Ledger §24.5.2

      qrCodes.push({
        id: qrId,
        code: fullCode,
        short_code: shortCode,
        batch_id: batch.id,
        status: 'unassigned',
      });
    }

    // Insert QR codes in batches (Supabase has limits)
    const batchSize = 100;
    for (let i = 0; i < qrCodes.length; i += batchSize) {
      const batch = qrCodes.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('qr_codes')
        .insert(batch);

      if (insertError) {
        console.error('Error inserting QR codes:', insertError);
        // Continue with other batches
      }
    }

    // Update batch status
    await supabase
      .from('qr_batches')
      .update({
        status: 'ready',
        generated_qr_codes: quantity,
        generated_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    // Log audit event
    await logAuditEvent({
      event_type: 'qr_batch_generated',
      event_category: 'admin',
      actor_user_id: adminUserId,
      actor_role: 'admin',
      entity_type: 'qr_batch',
      entity_id: batch.id,
      action: 'bulk_generate',
      description: `Admin generated ${quantity} QR codes in batch ${batchNumber}`,
      changes: {
        batch_id: batch.id,
        quantity,
        batch_type,
      },
      status: 'success',
      request_id: req.headers['x-request-id'] as string,
    });

    return res.status(201).json({
      id: batch.id,
      batch_number: batch.batch_number,
      batch_name: batch.batch_name,
      batch_type: batch.batch_type,
      quantity: quantity,
      status: 'ready',
      qr_codes_generated: quantity,
      // TODO: PDF/image generation will be added in later PR (Tier-3 feature)
      message: 'QR codes created. PDF/image generation deferred to Tier-3 implementation.',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('QR bulk generation error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

