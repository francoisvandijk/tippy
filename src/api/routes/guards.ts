// Guards API routes
// Ledger Reference: §7 (API Surface), §6 (Key Workflows), §24.4, §26
//
// Auth Requirements (Ledger §2, §8, §24.4):
// - POST /guards/register: Requires 'admin' OR 'referrer' role
//   - If invoked by referrer: referrer_id derived from req.auth.userId (body param ignored)
//   - If invoked by admin: admin may optionally supply referrer_id in body to attribute guard
// - GET /guards/me: Requires 'guard' role, uses req.auth.userId (not query param)

import { randomUUID } from 'crypto';

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { logAuditEvent } from '../../lib/audit';
import { requireAuth, requireRole } from '../../lib/auth';
import { supabase } from '../../lib/db';
import { sendWelcomeSms } from '../../lib/sms';
import { hashPhoneNumber, maskPhoneNumber } from '../../lib/utils';

const router = Router();

/**
 * POST /guards/register
 * Register a new guard
 * Per Ledger §7: Guard endpoint
 * Per Ledger §24.4: Guard Registration via Referrer
 * Per Ledger §24.3: Welcome SMS automatically triggered
 * 
 * Auth: Requires 'admin' OR 'referrer' role (Ledger §24.4.3, §24.4.4)
 * - Referrers may register guards (per §24.4.3)
 * - Admins may register guards (full system access per §2.4)
 */
const registerGuardSchema = z.object({
  primary_phone: z.string().min(10).max(15), // MSISDN
  name: z.string().min(1).max(255).optional(),
  language: z.string().length(2).default('en').optional(), // ISO 639-1 code
  location: z.string().max(255).optional(),
  referrer_id: z.string().uuid().optional(), // Only used if admin supplies it; referrer's ID comes from auth
  ref_code: z.string().optional(), // Alternative: referrer code (for referrer-initiated registration)
  guard_qr_id: z.string().uuid().optional(), // QR card to assign to guard
});

router.post(
  '/register',
  requireAuth,
  requireRole('admin', 'referrer'),
  async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = registerGuardSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
      }

      const {
        primary_phone,
        name,
        language = 'en',
        location,
        referrer_id: bodyReferrerId,
        ref_code,
        guard_qr_id,
      } = validationResult.data;

      // POPIA compliance: Hash MSISDN before any DB operations
      const msisdnHash = hashPhoneNumber(primary_phone);
      const msisdnMasked = maskPhoneNumber(primary_phone);

      // Anti-abuse checks per Ledger §24.4.5 (only for referrer-initiated registrations)
      if (req.auth!.role === 'referrer') {
        const ipAddress = req.ip || req.socket.remoteAddress || null;
        const _userAgent = req.get('user-agent') || null;
        const deviceId = req.headers['x-device-id'] as string || null;

        // Check daily limits per referrer
        const guardRegsPerReferrerPerDay = parseInt(process.env.GUARD_REGS_PER_REFERRER_PER_DAY || '15', 10);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count: todayRegs } = await supabase
          .from('guard_registration_events')
          .select('*', { count: 'exact', head: true })
          .eq('referrer_id', req.auth!.userId)
          .gte('created_at', today.toISOString());

        if (todayRegs && todayRegs >= guardRegsPerReferrerPerDay) {
          return res.status(429).json({
            error: 'RATE_LIMIT',
            message: `Daily registration limit exceeded (${guardRegsPerReferrerPerDay} per day)`,
          });
        }

        // Check device limit (if device_id provided)
        if (deviceId) {
          const guardRegsPerDevicePerDay = parseInt(process.env.GUARD_REGS_PER_DEVICE_PER_DAY || '20', 10);
          const { count: deviceRegs } = await supabase
            .from('guard_registration_events')
            .select('*', { count: 'exact', head: true })
            .eq('device_id', deviceId)
            .gte('created_at', today.toISOString());

          if (deviceRegs && deviceRegs >= guardRegsPerDevicePerDay) {
            return res.status(429).json({
              error: 'RATE_LIMIT',
              message: `Daily device registration limit exceeded (${guardRegsPerDevicePerDay} per day)`,
            });
          }
        }

        // Check IP limit
        if (ipAddress) {
          const guardRegsPerIpPerHour = parseInt(process.env.GUARD_REGS_PER_IP_PER_HOUR || '30', 10);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const { count: ipRegs } = await supabase
            .from('guard_registration_events')
            .select('*', { count: 'exact', head: true })
            .eq('ip_address', ipAddress)
            .gte('created_at', oneHourAgo.toISOString());

          if (ipRegs && ipRegs >= guardRegsPerIpPerHour) {
            return res.status(429).json({
              error: 'RATE_LIMIT',
              message: `Hourly IP registration limit exceeded (${guardRegsPerIpPerHour} per hour)`,
            });
          }
        }
      }

      // Verify and assign QR card if provided
      let qrCodeId: string | undefined;
      if (guard_qr_id) {
        const { data: qrCode, error: qrError } = await supabase
          .from('qr_codes')
          .select('id, status, assigned_guard_id')
          .eq('id', guard_qr_id)
          .single();

        if (qrError || !qrCode) {
          return res.status(404).json({
            error: 'VALIDATION_ERROR',
            message: 'QR card not found',
          });
        }

        if (qrCode.status !== 'unassigned') {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'QR card is already assigned',
          });
        }

        qrCodeId = qrCode.id;
      }

      // Determine registration method and referrer_id based on auth
      // Per Ledger §24.4: If invoked by referrer, derive referrer_id from req.auth.userId
      // Per Ledger §24.4: If invoked by admin, admin may optionally supply referrer_id
      let registrationMethod: 'manual' | 'admin' | 'referrer' | 'self' | 'assisted' = 'admin';
      let actualReferrerId: string | undefined;

      if (req.auth!.role === 'referrer') {
        // Referrer-initiated registration: derive referrer_id from auth
        registrationMethod = 'referrer';
        
        // Look up referrer by user_id (req.auth.userId maps to users.id, which references referrers.id)
        const { data: referrer, error: referrerError } = await supabase
          .from('referrers')
          .select('id, status')
          .eq('id', req.auth!.userId)
          .single();

        if (referrerError || !referrer) {
          return res.status(404).json({
            error: 'PROCESSOR_ERROR',
            message: 'Referrer profile not found',
          });
        }

        if (referrer.status !== 'ACTIVE') {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Referrer account is not active',
          });
        }

        actualReferrerId = referrer.id;
        
        // Ignore referrer_id from body if referrer role (security: body must not override identity)
        if (bodyReferrerId && bodyReferrerId !== actualReferrerId) {
          console.warn("[guards] Referrer attempted to supply different referrer_id in body, ignoring", { userId: req.auth!.userId, bodyReferrerId, actualReferrerId });
        }
      } else if (req.auth!.role === 'admin') {
        // Admin-initiated registration: may optionally supply referrer_id to attribute guard
        registrationMethod = 'admin';
        actualReferrerId = bodyReferrerId;

        // If admin supplies referrer_id, verify it exists and is active
        if (bodyReferrerId) {
          const { data: referrer } = await supabase
            .from('referrers')
            .select('id, status')
            .eq('id', bodyReferrerId)
            .single();

          if (!referrer || referrer.status !== 'ACTIVE') {
            return res.status(400).json({
              error: 'VALIDATION_ERROR',
              message: 'Referrer not found or not active',
            });
          }
        }

        // If ref_code provided, look up referrer (admin can use ref_code)
        if (ref_code && !bodyReferrerId) {
          const { data: referrer } = await supabase
            .from('referrers')
            .select('id, status')
            .eq('ref_code', ref_code)
            .single();

          if (referrer && referrer.status === 'ACTIVE') {
            actualReferrerId = referrer.id;
          } else {
            return res.status(400).json({
              error: 'VALIDATION_ERROR',
              message: 'Invalid or inactive referrer code',
            });
          }
        }
      }

      // Check if guard already exists (by MSISDN hash)
      const { data: existingGuard } = await supabase
        .from('guards')
        .select('id, display_name, status')
        .eq('msisdn_hash', msisdnHash)
        .single();

      let guardId: string;
      let isNewGuard = false;

      if (existingGuard) {
        // Guard already exists - idempotent registration
        guardId = existingGuard.id;

        // If guard is already active, return success
        if (existingGuard.status === 'active') {
          return res.status(200).json({
            message: 'Guard already registered',
            guard_id: guardId,
            sms_status: 'skipped', // SMS already sent on first registration
          });
        }
      } else {
        // Create new guard
        isNewGuard = true;

        // First, create user record
        const userId = randomUUID();
        const { error: userError } = await supabase.from('users').insert({
          id: userId,
          role: 'guard',
        });

        if (userError) {
          console.error("[guards] Error creating user", userError?.message);
          return res.status(500).json({
            error: 'PROCESSOR_ERROR',
            message: 'Failed to register guard',
          });
        }

        // Create guard record with hashed MSISDN
        // Note: guards table has msisdn (for uniqueness) and msisdn_hash (for queries)
        // Per Ledger: we store both, but msisdn_hash is primary for POPIA compliance
        const displayName = name || `Guard-${primary_phone.slice(-4)}`;
        const { data: newGuard, error: guardError } = await supabase
          .from('guards')
          .insert({
            id: userId,
            display_name: displayName,
            msisdn: primary_phone, // Stored for uniqueness constraint, but not used in queries
            msisdn_hash: msisdnHash, // POPIA-compliant storage (primary for queries)
            status: 'pending',
            language: language,
            referred_by_referrer_id: actualReferrerId || null,
            metadata: location ? { location } : null,
          })
          .select('id')
          .single();

        if (guardError || !newGuard) {
          console.error("[guards] Error creating guard", guardError?.message);
          return res.status(500).json({
            error: 'PROCESSOR_ERROR',
            message: 'Failed to register guard',
          });
        }

        guardId = newGuard.id;
      }

      // Assign QR card to guard if provided
      if (qrCodeId && guardId) {
        const { error: qrAssignError } = await supabase
          .from('qr_codes')
          .update({
            assigned_guard_id: guardId,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
          })
          .eq('id', qrCodeId);

        if (qrAssignError) {
          console.error("[guards] Error assigning QR code", qrAssignError?.message);
          // Non-blocking: continue even if QR assignment fails
        } else {
          // Update guard status to active if QR assigned
          await supabase
            .from('guards')
            .update({ status: 'active', activated_at: new Date().toISOString() })
            .eq('id', guardId);
        }
      }

      // Create guard_registration_events record
      const { data: registrationEvent, error: eventError } = await supabase
        .from('guard_registration_events')
        .insert({
          guard_id: guardId,
          guard_msisdn_hash: msisdnHash, // POPIA-compliant
          registration_method: registrationMethod,
          referrer_id: actualReferrerId || null,
          registered_by_user_id: req.auth!.userId, // Extract from auth token (P1.6)
          actor_user_id: req.auth!.userId, // For backward compatibility
          actor_role: req.auth!.role, // Extract from auth token (P1.6)
          ip_address: req.ip || req.socket.remoteAddress || null,
          user_agent: req.get('user-agent') || null,
          device_id: req.headers['x-device-id'] as string || null,
          qr_code_id: qrCodeId || null,
          status: 'completed',
          metadata: {
            language,
            location,
            ref_code: ref_code || null,
          },
        })
        .select('id')
        .single();

      if (eventError) {
        console.error("[guards] Error creating registration event", eventError?.message);
        // Non-blocking: continue even if event logging fails
      }

      // Send Welcome SMS per Ledger §24.3
      let smsStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      let smsEventId: string | undefined;

      if (isNewGuard) {
        try {
          const smsResult = await sendWelcomeSms(
            {
              id: guardId,
              display_name: name,
              language: language,
              msisdn: primary_phone,
            },
            {
              referrerId: actualReferrerId,
            }
          );

          if (smsResult.success) {
            smsStatus = 'sent';
            smsEventId = smsResult.smsEventId;
          } else {
            smsStatus = 'failed';
            console.error("[guards] Welcome SMS failed", smsResult.error);
          }

          // Update registration event with SMS status
          if (registrationEvent?.id) {
            await supabase
              .from('guard_registration_events')
              .update({
                welcome_sms_sent: smsResult.success,
                welcome_sms_event_id: smsEventId || null,
              })
              .eq('id', registrationEvent.id);
          }
        } catch (smsError) {
          smsStatus = 'failed';
          console.error("[guards] Welcome SMS error", smsError instanceof Error ? smsError.message : String(smsError));
          // Non-blocking: registration succeeds even if SMS fails
        }
      }

      // Create referral record if registered via referrer
      let referralId: string | undefined;
      if (actualReferrerId && isNewGuard) {
        const { data: referral, error: referralError } = await supabase
          .from('referrals')
          .insert({
            referrer_id: actualReferrerId,
            referred_guard_id: guardId,
            referred_guard_msisdn_hash: msisdnHash, // POPIA-compliant
            status: 'pending',
          })
          .select('id')
          .single();

        if (referralError) {
          console.error("[guards] Error creating referral", referralError?.message);
          // Non-blocking: registration succeeds even if referral creation fails
        } else {
          referralId = referral.id;
        }
      }

      // Log audit event (non-blocking)
      try {
        await logAuditEvent({
          event_type: 'GUARD_REGISTERED',
          event_category: 'registration',
          actor_user_id: req.auth!.userId, // Extract from auth token (P1.6)
          actor_role: req.auth!.role, // Extract from auth token (P1.6)
          actor_ip_address: req.ip || req.socket.remoteAddress || undefined,
          actor_user_agent: req.get('user-agent') || undefined,
          entity_type: 'guard',
          entity_id: guardId,
          action: 'register',
          description: `Guard registered via ${registrationMethod}. MSISDN: ${msisdnMasked}`,
          status: 'success',
          metadata: {
            registration_method: registrationMethod,
            referrer_id: actualReferrerId,
            referral_id: referralId,
            sms_status: smsStatus,
            sms_event_id: smsEventId,
          },
        });
      } catch (auditError) {
        console.error("[guards] Audit logging error", auditError instanceof Error ? auditError.message : String(auditError));
        // Non-blocking: registration succeeds even if audit logging fails
      }

      return res.status(201).json({
        message: 'Guard registered successfully',
        guard_id: guardId,
        registration_method: registrationMethod,
        sms_status: smsStatus,
        referral_id: referralId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[guards] Guard registration error", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to register guard',
      });
    }
  }
);

/**
 * GET /guards/me
 * Get current guard's profile and earnings summary
 * Per Ledger §7: Guard endpoint (optional, for guard console)
 * 
 * Auth: Requires 'guard' role (Ledger §2.4, §8)
 * - Uses req.auth.userId to identify guard (not query param)
 * - RLS ensures guard can only see their own data
 */
router.get(
  '/me',
  requireAuth,
  requireRole('guard'),
  async (req: Request, res: Response) => {
    try {
      // Extract guard_id from authentication token (P1.6)
      // req.auth.userId maps to guards.id (guards.id references users.id)
      const guardId = req.auth!.userId;

      // Fetch guard profile
      // RLS policy ensures guard can only see their own record
      const { data: guard, error: guardError } = await supabase
        .from('guards')
        .select(`
          id,
          display_name,
          status,
          lifetime_gross_tips,
          lifetime_net_tips,
          lifetime_payouts,
          language,
          created_at,
          activated_at
        `)
        .eq('id', guardId)
        .single();

      if (guardError || !guard) {
        return res.status(404).json({
          error: 'PROCESSOR_ERROR',
          message: 'Guard not found',
        });
      }

      // Fetch active QR code
      // RLS ensures guard can only see QR codes assigned to them
      const { data: activeQr } = await supabase
        .from('qr_codes')
        .select('id, code, short_code, status, assigned_at')
        .eq('assigned_guard_id', guardId)
        .eq('status', 'active')
        .single();

      // Fetch recent payments (last 5 per Ledger §6.2)
      // RLS ensures guard can only see their own payments
      const { data: recentPayments } = await supabase
        .from('payments')
        .select('id, amount_gross, amount_net, status, created_at')
        .eq('guard_id', guardId)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(5);

      // Calculate current balance (net tips - payouts)
      const currentBalance = guard.lifetime_net_tips - guard.lifetime_payouts;
      const isEligibleForPayout = currentBalance >= 50000; // R500 in cents per Ledger §9

      return res.status(200).json({
        id: guard.id,
        display_name: guard.display_name,
        status: guard.status,
        earnings: {
          lifetime_gross: guard.lifetime_gross_tips,
          lifetime_net: guard.lifetime_net_tips,
          lifetime_payouts: guard.lifetime_payouts,
          current_balance: currentBalance,
          is_eligible_for_payout: isEligibleForPayout,
        },
        qr_code: activeQr
          ? {
              id: activeQr.id,
              code: activeQr.code,
              short_code: activeQr.short_code,
              assigned_at: activeQr.assigned_at,
            }
          : null,
        recent_payments: recentPayments || [],
        language: guard.language,
        created_at: guard.created_at,
        activated_at: guard.activated_at,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[guards] Guard profile fetch error", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch guard profile',
      });
    }
  }
);

/**
 * GET /guards/me/earnings
 * Get current guard's earnings summary
 * Per Ledger §7: Guard endpoint
 * Per Ledger §9: Payouts visibility
 * 
 * Auth: Requires 'guard' role (Ledger §2.4, §8)
 */
router.get(
  '/me/earnings',
  requireAuth,
  requireRole('guard'),
  async (req: Request, res: Response) => {
    try {
      const guardId = req.auth!.userId;

      // Fetch guard with financial data
      const { data: guard, error: guardError } = await supabase
        .from('guards')
        .select('id, lifetime_gross_tips, lifetime_net_tips, lifetime_payouts, status')
        .eq('id', guardId)
        .single();

      if (guardError || !guard) {
        return res.status(404).json({
          error: 'PROCESSOR_ERROR',
          message: 'Guard not found',
        });
      }

      // Calculate current unpaid balance
      const currentBalance = guard.lifetime_net_tips - guard.lifetime_payouts;
      const isEligibleForPayout = currentBalance >= 50000; // R500 in cents per Ledger §9

      // Get last payout
      const { data: lastPayout } = await supabase
        .from('payout_batch_items')
        .select('payout_batches!inner(processed_date), net_amount_zar_cents, sent_at')
        .eq('guard_id', guardId)
        .eq('item_type', 'GUARD')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      return res.status(200).json({
        current_unpaid_balance_zar_cents: currentBalance,
        is_eligible_for_payout: isEligibleForPayout,
        lifetime_gross_tips_zar_cents: guard.lifetime_gross_tips,
        lifetime_net_tips_zar_cents: guard.lifetime_net_tips,
        lifetime_payouts_zar_cents: guard.lifetime_payouts,
        last_payout: lastPayout ? {
          amount_zar_cents: lastPayout.net_amount_zar_cents,
          date: lastPayout.sent_at,
        } : null,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[guards] Earnings fetch error", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch earnings',
      });
    }
  }
);

/**
 * GET /guards/me/payouts
 * Get paginated list of past payouts for current guard
 * Per Ledger §7: Guard endpoint
 * 
 * Auth: Requires 'guard' role (Ledger §2.4, §8)
 */
router.get(
  '/me/payouts',
  requireAuth,
  requireRole('guard'),
  async (req: Request, res: Response) => {
    try {
      const guardId = req.auth!.userId;
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const offset = (page - 1) * limit;

      // Fetch payouts
      const { data: payouts, error: payoutsError } = await supabase
        .from('payout_batch_items')
        .select(`
          id,
          net_amount_zar_cents,
          sent_at,
          status,
          payout_batches!inner(
            batch_number,
            period_start_date,
            period_end_date,
            processed_date
          )
        `)
        .eq('guard_id', guardId)
        .eq('item_type', 'GUARD')
        .order('sent_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (payoutsError) {
        return res.status(500).json({
          error: 'PROCESSOR_ERROR',
          message: 'Failed to fetch payouts',
        });
      }

      // Get total count
      const { count } = await supabase
        .from('payout_batch_items')
        .select('*', { count: 'exact', head: true })
        .eq('guard_id', guardId)
        .eq('item_type', 'GUARD');

      return res.status(200).json({
        payouts: payouts || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit),
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[guards] Payouts fetch error", errorMessage);
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Failed to fetch payouts',
      });
    }
  }
);

export default router;




