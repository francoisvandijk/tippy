// Payments API routes
// Ledger Reference: §7 (API Surface), §6 (Key Workflows), §5 (Fees & Calculations)

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { supabase } from '../../lib/db';
import { calculateFees, generatePaymentReference } from '../../lib/fees';
import { YocoClient } from '../../lib/yoco';
import type { PaymentResponse } from '../../types/payment';

const router = Router();
const yocoClient = new YocoClient();

// Validation schema per Ledger requirements
const createPaymentSchema = z.object({
  amount_gross: z.number().int().positive().max(10000000), // Max R100,000 (10M cents)
  guard_id: z.string().uuid(),
  qr_code_id: z.string().uuid().optional(),
  card_token: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /payments/create
 * Per Ledger §7: Public/User endpoint
 * Per Ledger §6.1: User Tipping (Yoco) workflow
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = createPaymentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const amountGross = data.amount_gross; // ZAR cents

    // Calculate fees per Ledger §5
    const fees = calculateFees(amountGross);

    // Generate payment reference per Ledger format
    const referenceNumber = generatePaymentReference();

    // Create payment record in database (pending status)
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        reference_prefix: 'TPY',
        reference_number: referenceNumber,
        guard_id: data.guard_id,
        qr_code_id: data.qr_code_id || null,
        amount_gross: amountGross,
        processor_fee: fees.processorFee,
        platform_fee: fees.platformFee,
        vat_on_platform: fees.vatOnPlatform,
        amount_net: fees.netAmount,
        status: 'pending',
        metadata: data.metadata || null,
        ip_address: req.ip || req.socket.remoteAddress || null,
        user_agent: req.get('user-agent') || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error creating payment:', dbError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to create payment record',
      });
    }

    // If card token provided, process payment with Yoco
    if (data.card_token) {
      try {
        const yocoCharge = await yocoClient.createCharge({
          amount: amountGross,
          currency: 'ZAR',
          token: data.card_token,
          reference: referenceNumber,
          metadata: {
            guard_id: data.guard_id,
            payment_id: payment.id,
          },
        });

        // Update payment with Yoco response
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            yoco_charge_id: yocoCharge.id,
            yoco_payment_id: yocoCharge.id,
            yoco_status: yocoCharge.status,
            status: yocoCharge.status === 'successful' ? 'succeeded' : 'failed',
            card_last_four: yocoCharge.cardLast4 || null,
            card_brand: yocoCharge.cardBrand || null,
            processed_at: yocoCharge.status === 'successful' ? new Date().toISOString() : null,
            failed_at: yocoCharge.status === 'failed' ? new Date().toISOString() : null,
            yoco_failure_reason: yocoCharge.failureReason || null,
          })
          .eq('id', payment.id);

        if (updateError) {
          console.error('Database error updating payment:', updateError);
        }

        // Return response based on Yoco result
        if (yocoCharge.status === 'successful') {
          return res.status(200).json({
            id: payment.id,
            reference_number: payment.reference_number,
            status: 'succeeded' as const,
            amount_gross: payment.amount_gross,
            amount_net: payment.amount_net,
            created_at: payment.created_at,
          } as PaymentResponse);
        } else {
          return res.status(402).json({
            error: 'PAYMENT_FAILED',
            message: yocoCharge.failureReason || 'Payment processing failed',
            payment_id: payment.id,
          });
        }
      } catch (yocoError: unknown) {
        const errorMessage = yocoError instanceof Error ? yocoError.message : 'Unknown error';
        console.error('Yoco API error:', errorMessage);

        // Update payment status to failed
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            yoco_failure_reason: errorMessage,
          })
          .eq('id', payment.id);

        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Payment processing failed',
          payment_id: payment.id,
        });
      }
    }

    // If no card token, return pending payment (for async processing)
    return res.status(202).json({
      id: payment.id,
      reference_number: payment.reference_number,
      status: 'pending' as const,
      amount_gross: payment.amount_gross,
      amount_net: payment.amount_net,
      created_at: payment.created_at,
    } as PaymentResponse);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Payment creation error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;
