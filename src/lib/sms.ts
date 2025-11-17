// SMS Service
// Ledger Reference: §24.3 (Welcome SMS Policy), §13 (POPIA & Security)
//
// Note: This service is called from authenticated endpoints (e.g., POST /guards/register)
// No additional auth required here - caller is responsible for auth enforcement

import { supabase } from './db';
import { hashPhoneNumber, maskPhoneNumber } from './utils';

export interface SmsProviderResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  response?: Record<string, unknown>;
}

export interface SendSmsOptions {
  phoneNumber: string;
  message: string;
  templateId?: string;
  language?: string;
  eventType?: 'welcome_sms' | 'notification' | 'otp' | 'other';
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
}

export interface SmsResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  smsEventId?: string;
}

/**
 * Send SMS via SendGrid or Twilio
 * Per Ledger §24.3: Welcome SMS Policy (Locked)
 */
export async function sendSms(options: SendSmsOptions): Promise<SmsResult> {
  const {
    phoneNumber,
    message,
    templateId = 'tippy_guard_welcome_v1',
    language = 'en',
    eventType = 'welcome_sms',
    relatedEntityType,
    relatedEntityId,
    metadata = {},
  } = options;

  // POPIA compliance: hash and mask MSISDN
  const msisdnHash = hashPhoneNumber(phoneNumber);
  const msisdnMasked = maskPhoneNumber(phoneNumber);

  // Get SMS provider configuration from app_settings or env vars
  const provider = process.env.SMS_PROVIDER || 'sendgrid'; // Default to SendGrid
  const maxRetries = parseInt(process.env.WELCOME_SMS_RETRY_COUNT || '3', 10);

  // Log initial SMS attempt
  let smsEventId: string | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create SMS event record (pending status)
      const { data: smsEvent, error: smsEventError } = await supabase
        .from('sms_events')
        .insert({
          recipient_msisdn_hash: msisdnHash,
          recipient_msisdn_masked: msisdnMasked,
          template_id: templateId,
          language: language,
          message_text: message,
          status: 'pending',
          provider: provider,
          attempt_number: attempt,
          event_type: eventType,
          related_entity_type: relatedEntityType,
          related_entity_id: relatedEntityId,
          metadata: metadata,
        })
        .select('id')
        .single();

      if (smsEventError || !smsEvent) {
        console.error('Failed to create SMS event record:', smsEventError);
        // Continue anyway - we'll log failure later
      } else {
        smsEventId = smsEvent.id;
      }

      // Send SMS via provider
      let providerMessageId: string | undefined;
      let providerResponse: Record<string, unknown> | undefined;

      if (provider === 'sendgrid') {
        const result = await sendViaSendGrid(phoneNumber, message);
        providerMessageId = result.messageId;
        providerResponse = result.response;
        
        if (!result.success) {
          throw new Error(result.error || 'SendGrid API error');
        }
      } else if (provider === 'twilio') {
        const result = await sendViaTwilio(phoneNumber, message);
        providerMessageId = result.messageId;
        providerResponse = result.response;
        
        if (!result.success) {
          throw new Error(result.error || 'Twilio API error');
        }
      } else {
        throw new Error(`Unsupported SMS provider: ${provider}`);
      }

      // Update SMS event with success
      if (smsEventId) {
        await supabase
          .from('sms_events')
          .update({
            status: 'sent',
            provider_message_id: providerMessageId,
            provider_response: providerResponse,
            sent_at: new Date().toISOString(),
          })
          .eq('id', smsEventId);
      }

      return {
        success: true,
        providerMessageId,
        smsEventId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError = errorMessage;

      // Update SMS event with failure (if we have an event ID)
      if (smsEventId) {
        await supabase
          .from('sms_events')
          .update({
            status: attempt < maxRetries ? 'pending' : 'failed',
            error_message: errorMessage,
            failed_at: attempt === maxRetries ? new Date().toISOString() : null,
          })
          .eq('id', smsEventId);
      }

      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  // All retries failed
  return {
    success: false,
    error: lastError || 'SMS sending failed after all retries',
    smsEventId,
  };
}

/**
 * Send SMS via SendGrid
 */
async function sendViaSendGrid(
  phoneNumber: string,
  message: string
): Promise<SmsProviderResponse> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SENDGRID_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ phone: phoneNumber }],
          },
        ],
        from: { phone: process.env.SENDGRID_FROM_PHONE || process.env.WELCOME_SMS_SENDER_ID },
        content: [
          {
            type: 'text/plain',
            value: message,
          },
        ],
      }),
    });

    const responseData = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return {
        success: false,
        error: `SendGrid API error: ${JSON.stringify(responseData)}`,
        response: responseData,
      };
    }

    return {
      success: true,
      messageId: (responseData.message_id ?? responseData.id) as string | undefined,
      response: responseData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send SMS via Twilio
 */
async function sendViaTwilio(
  phoneNumber: string,
  message: string
): Promise<SmsProviderResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER || process.env.WELCOME_SMS_SENDER_ID;

  if (!accountSid || !authToken || !fromPhone) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: fromPhone,
      To: phoneNumber,
      Body: message,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const responseData = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return {
        success: false,
        error: `Twilio API error: ${(responseData.message as string) || JSON.stringify(responseData)}`,
        response: responseData,
      };
    }

    return {
      success: true,
      messageId: responseData.sid as string | undefined,
      response: responseData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send Welcome SMS to guard
 * Per Ledger §24.3: Welcome SMS Policy (Locked)
 */
export async function sendWelcomeSms(
  guard: {
    id: string;
    display_name?: string | null;
    language?: string | null;
    msisdn?: string;
  },
  options?: {
    referrerId?: string;
    payoutDay?: string;
    supportNumber?: string;
  }
): Promise<SmsResult> {
  // Get configuration from app_settings or env vars
  const sendWelcomeSms = process.env.SEND_GUARD_WELCOME_SMS !== 'false'; // Default true
  if (!sendWelcomeSms) {
    return {
      success: false,
      error: 'Welcome SMS is disabled',
    };
  }

  const language = guard.language || 'en';
  const payoutDay = options?.payoutDay || process.env.PAYOUT_WEEKLY_SCHEDULE || 'Friday';
  const supportNumber = options?.supportNumber || process.env.SUPPORT_PHONE_NUMBER || '060-123-4567';

  // Get phone number (required)
  const phoneNumber = guard.msisdn;
  if (!phoneNumber) {
    return {
      success: false,
      error: 'Guard MSISDN is required',
    };
  }

  // Build welcome message per Ledger §24.3
  // Format: "Hi [Name/there], welcome to Tippy! You've been registered to receive digital tips via your QR card. Payouts are weekly. Need help? WhatsApp [SupportNumber]."
  const name = guard.display_name || 'there';
  const message = `Hi ${name}, welcome to Tippy! You've been registered to receive digital tips via your QR card. Payouts are ${payoutDay}. Need help? WhatsApp ${supportNumber}.`;

  // Ensure message is ≤160 chars per Ledger §24.3
  if (message.length > 160) {
    // Truncate if needed
    const truncated = message.substring(0, 157) + '...';
    console.warn(`Welcome SMS message truncated from ${message.length} to 160 chars`);
  }

  return sendSms({
    phoneNumber,
    message: message.length > 160 ? message.substring(0, 157) + '...' : message,
    templateId: process.env.WELCOME_SMS_TEMPLATE_ID || 'tippy_guard_welcome_v1',
    language,
    eventType: 'welcome_sms',
    relatedEntityType: 'guard',
    relatedEntityId: guard.id,
    metadata: {
      referrer_id: options?.referrerId,
      payout_day: payoutDay,
    },
  });
}




