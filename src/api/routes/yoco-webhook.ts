// Yoco webhook handler
// Ledger Reference: §7 (API Surface), §6 (Key Workflows)

import { Router, Request, Response } from 'express';

import { supabase } from '../../lib/db';
import { YocoClient } from '../../lib/yoco';
import type { YocoWebhookEvent } from '../../lib/yoco';

const router = Router();
const yocoClient = new YocoClient();

/**
 * POST /payments/webhook
 * Per Ledger §7: Public/User endpoint
 * Handles Yoco webhook events for payment status updates
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature if configured
    const signature = req.get('x-yoco-signature') || req.get('authorization') || '';
    const payload = JSON.stringify(req.body);

    if (process.env.YOCO_WEBHOOK_SECRET) {
      const isValid = yocoClient.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event: YocoWebhookEvent = req.body;

    // Handle different event types
    if (event.type === 'charge.succeeded' || event.type === 'charge.failed') {
      const chargeData = event.data;

      // Find payment by Yoco charge ID
      const { data: payments, error: findError } = await supabase
        .from('payments')
        .select('*')
        .eq('yoco_charge_id', chargeData.id)
        .limit(1);

      if (findError) {
        console.error('Database error finding payment:', findError);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!payments || payments.length === 0) {
        console.warn(`Payment not found for Yoco charge ID: ${chargeData.id}`);
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = payments[0];

      // Idempotency check: don't update if already processed
      if (payment.status === 'succeeded' && event.type === 'charge.succeeded') {
        return res.status(200).json({ message: 'Already processed' });
      }

      // Update payment status
      const updateData: Record<string, unknown> = {
        yoco_status: chargeData.status,
        status: chargeData.status === 'successful' ? 'succeeded' : 'failed',
        updated_at: new Date().toISOString(),
      };

      if (chargeData.status === 'successful') {
        updateData.processed_at = new Date().toISOString();
      } else {
        updateData.failed_at = new Date().toISOString();
        updateData.yoco_failure_reason = chargeData.failureReason || null;
      }

      const { error: updateError } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', payment.id);

      if (updateError) {
        console.error('Database error updating payment:', updateError);
        return res.status(500).json({ error: 'Database error' });
      }

      // Log webhook event (no PII)
      console.warn(`Payment ${payment.id} updated via webhook: ${chargeData.status}`);

      return res.status(200).json({ message: 'Webhook processed' });
    }

    // Handle other event types if needed
    return res.status(200).json({ message: 'Event received' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook processing error:', errorMessage);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
