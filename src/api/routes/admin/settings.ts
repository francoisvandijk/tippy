// Admin Settings API routes
// Ledger Reference: §7 (API Surface), §3 (Config)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../../lib/db';
import { logAuditEvent } from '../../../lib/audit';

const router = Router();

// Validation schema
const setSettingSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string(),
  value_type: z.enum(['string', 'number', 'boolean', 'json']).optional(),
});

// Allowed setting keys from Ledger §3
const ALLOWED_SETTING_KEYS = [
  'PAYMENT_PROVIDER',
  'YOCO_FEES_MODE',
  'YOCO_FEE_PERCENT',
  'YOCO_FIXED_FEE',
  'PLATFORM_FEE_PERCENT',
  'VAT_ENABLED',
  'VAT_RATE_PERCENT',
  'VAT_APPLIES_TO',
  'CASH_SEND_FEE_ZAR',
  'PAYOUT_WEEKLY_SCHEDULE',
  'PAYOUT_MIN_ELIGIBILITY_ZAR',
  'SHOW_NET_ONLY_TO_GUARD',
  'QR_REPLACEMENT_FEE_ZAR',
  'QR_SELF_REASSIGN_ENABLED',
  'QR_ONE_ACTIVE_PER_GUARD',
  'TIP_HISTORY_MAX_ROWS',
  'SAVE_CARD_AUTOMATICALLY',
  'MASK_CARD_DIGITS_SHOWN',
  'REFERRAL_ENABLED',
  'REFERRAL_FEE_PER_GUARD_ZAR',
  'REFERRAL_TIP_THRESHOLD_ZAR',
  'REFERRAL_PAYOUT_MINIMUM_ZAR',
  'REFERRAL_MAX_PER_REFERRER_PER_DAY',
  'REFERRAL_LOCKOUT_DAYS_FOR_DUPLICATE_MSISDN',
  'NEARBY_RADIUS_METERS',
  'NEARBY_DWELL_MINUTES',
  'NOTIFY_USER_TEXT',
  'AUTO_EMAIL_QR_BATCH',
  'AUTO_EMAIL_WEEKLY_PAYOUT',
  'AUTO_GENERATE_WEEKLY_PAYOUT',
  'REFERENCE_PREFIX',
];

/**
 * POST /admin/settings/set
 * Update app setting value
 * Per Ledger §7: Admin endpoint
 * Per Ledger §3: Config (Admin-Editable Defaults)
 */
router.post('/set', async (req: Request, res: Response) => {
  try {
    // TODO: Verify admin authentication (P1.6)
    const adminUserId = req.body.admin_user_id as string;

    // Validate request body
    const validationResult = setSettingSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
    }

    const { key, value, value_type } = validationResult.data;

    // Check if key is allowed (must be in Ledger §3 or already in app_settings)
    const { data: existingSetting } = await supabase
      .from('app_settings')
      .select('key, value_type, is_editable')
      .eq('key', key)
      .single();

    if (!existingSetting) {
      // Key doesn't exist - check if it's in allowed list
      if (!ALLOWED_SETTING_KEYS.includes(key)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Setting key '${key}' is not allowed. Must be from Ledger §3 or already exist in app_settings.`,
        });
      }
    } else {
      // Key exists - check if editable
      if (!existingSetting.is_editable) {
        return res.status(403).json({
          error: 'VALIDATION_ERROR',
          message: `Setting '${key}' is not editable`,
        });
      }
    }

    // Determine value type if not provided
    let finalValueType = value_type || existingSetting?.value_type || 'string';
    if (!value_type && existingSetting) {
      finalValueType = existingSetting.value_type;
    }

    // Validate value based on type
    let validatedValue = value;
    if (finalValueType === 'number') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Value for '${key}' must be a valid number`,
        });
      }
      validatedValue = numValue.toString();
    } else if (finalValueType === 'boolean') {
      if (value !== 'true' && value !== 'false') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Value for '${key}' must be 'true' or 'false'`,
        });
      }
      validatedValue = value;
    } else if (finalValueType === 'json') {
      try {
        JSON.parse(value);
      } catch {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Value for '${key}' must be valid JSON`,
        });
      }
      validatedValue = value;
    }

    // Upsert setting
    const { data: setting, error: settingError } = await supabase
      .from('app_settings')
      .upsert({
        key,
        value: validatedValue,
        value_type: finalValueType,
        updated_by_user_id: adminUserId || null,
      }, {
        onConflict: 'key',
      })
      .select()
      .single();

    if (settingError) {
      console.error('Error updating setting:', settingError);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to update setting',
      });
    }

    // Log audit event
    await logAuditEvent({
      event_type: 'app_setting_updated',
      event_category: 'admin',
      actor_user_id: adminUserId,
      actor_role: 'admin',
      entity_type: 'app_setting',
      entity_id: setting.id,
      action: 'update',
      description: `Admin updated setting '${key}'`,
      changes: {
        key,
        old_value: existingSetting?.value || null,
        new_value: validatedValue,
      },
      status: 'success',
      request_id: req.headers['x-request-id'] as string,
    });

    return res.status(200).json({
      id: setting.id,
      key: setting.key,
      value: setting.value,
      value_type: setting.value_type,
      updated_at: setting.updated_at,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Settings update error:', errorMessage);
    return res.status(500).json({
      error: 'PROCESSOR_ERROR',
      message: 'Internal server error',
    });
  }
});

export default router;

