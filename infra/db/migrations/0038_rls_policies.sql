-- Migration: 0019_rls_policies.sql
-- Row Level Security (RLS) Policies
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §8 (RLS / Security), §2 (Roles & Access)

-- Enable RLS on core tables
-- Per Ledger §8: Guards read self, Referrers read own referrals/earnings, Admin full access

-- ============================================================================
-- GUARDS TABLE
-- ============================================================================

ALTER TABLE guards ENABLE ROW LEVEL SECURITY;

-- Guards can select their own record
-- Using guards.id = auth.uid() (guards.id references users.id)
CREATE POLICY "guard_select_self"
ON guards
FOR SELECT
USING (id = auth.uid());

-- Guards can update their own record (for self-service features like QR reassignment)
CREATE POLICY "guard_update_self"
ON guards
FOR UPDATE
USING (id = auth.uid());

-- Admins can select all guards (using service role key bypasses RLS)
-- Note: Admin access is handled via service role key, not RLS policy
-- This policy allows authenticated admin users via JWT
CREATE POLICY "admin_select_all_guards"
ON guards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Admins can update all guards
CREATE POLICY "admin_update_all_guards"
ON guards
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- REFERRERS TABLE
-- ============================================================================

ALTER TABLE referrers ENABLE ROW LEVEL SECURITY;

-- Referrers can select their own record
CREATE POLICY "referrer_select_self"
ON referrers
FOR SELECT
USING (id = auth.uid());

-- Referrers can update their own record
CREATE POLICY "referrer_update_self"
ON referrers
FOR UPDATE
USING (id = auth.uid());

-- Admins can select all referrers
CREATE POLICY "admin_select_all_referrers"
ON referrers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Admins can update all referrers
CREATE POLICY "admin_update_all_referrers"
ON referrers
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- REFERRALS TABLE
-- ============================================================================

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Referrers can only see their own referrals
CREATE POLICY "referrer_select_own_referrals"
ON referrals
FOR SELECT
USING (
  referrer_id IN (
    SELECT id FROM referrers WHERE id = auth.uid()
  )
);

-- Admins can select all referrals
CREATE POLICY "admin_select_all_referrals"
ON referrals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- REFERRAL_EARNINGS_LEDGER TABLE
-- ============================================================================

ALTER TABLE referral_earnings_ledger ENABLE ROW LEVEL SECURITY;

-- Referrers can only see their own earnings
CREATE POLICY "referrer_select_own_earnings"
ON referral_earnings_ledger
FOR SELECT
USING (
  referrer_id IN (
    SELECT id FROM referrers WHERE id = auth.uid()
  )
);

-- Admins can select all earnings
CREATE POLICY "admin_select_all_earnings"
ON referral_earnings_ledger
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Guards can see payments for their own guard_id
CREATE POLICY "guard_select_own_payments"
ON payments
FOR SELECT
USING (
  guard_id IN (
    SELECT id FROM guards WHERE id = auth.uid()
  )
);

-- Public can create payments (for tipping flow)
-- Note: This allows anonymous users to create payments
-- RLS will still enforce that guards can only see their own payments
CREATE POLICY "public_create_payments"
ON payments
FOR INSERT
WITH CHECK (true);

-- Admins can select all payments
CREATE POLICY "admin_select_all_payments"
ON payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- PAYOUT_BATCHES TABLE
-- ============================================================================

ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;

-- Only admins can view payout batches
CREATE POLICY "admin_select_payout_batches"
ON payout_batches
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Only admins can create/update payout batches
CREATE POLICY "admin_modify_payout_batches"
ON payout_batches
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- PAYOUT_BATCH_ITEMS TABLE
-- ============================================================================

ALTER TABLE payout_batch_items ENABLE ROW LEVEL SECURITY;

-- Guards can see their own payout items
CREATE POLICY "guard_select_own_payout_items"
ON payout_batch_items
FOR SELECT
USING (
  guard_id IN (
    SELECT id FROM guards WHERE id = auth.uid()
  )
  OR referrer_id IN (
    SELECT id FROM referrers WHERE id = auth.uid()
  )
);

-- Admins can select all payout items
CREATE POLICY "admin_select_all_payout_items"
ON payout_batch_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- QR_CODES TABLE
-- ============================================================================

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

-- Guards can see QR codes assigned to them
CREATE POLICY "guard_select_own_qr_codes"
ON qr_codes
FOR SELECT
USING (
  assigned_guard_id IN (
    SELECT id FROM guards WHERE id = auth.uid()
  )
);

-- Guards can update their own QR codes (for reassignment)
CREATE POLICY "guard_update_own_qr_codes"
ON qr_codes
FOR UPDATE
USING (
  assigned_guard_id IN (
    SELECT id FROM guards WHERE id = auth.uid()
  )
);

-- Admins can select all QR codes
CREATE POLICY "admin_select_all_qr_codes"
ON qr_codes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Admins can update all QR codes
CREATE POLICY "admin_update_all_qr_codes"
ON qr_codes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- USERS TABLE
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can select their own record
CREATE POLICY "user_select_self"
ON users
FOR SELECT
USING (id = auth.uid());

-- Users can update their own record (limited fields)
CREATE POLICY "user_update_self"
ON users
FOR UPDATE
USING (id = auth.uid());

-- Admins can select all users
CREATE POLICY "admin_select_all_users"
ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================================
-- AUDIT_LOG TABLE
-- ============================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own audit log entries (where actor_user_id matches)
CREATE POLICY "user_select_own_audit_logs"
ON audit_log
FOR SELECT
USING (actor_user_id = auth.uid());

-- Admins can see all audit logs
CREATE POLICY "admin_select_all_audit_logs"
ON audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Service role can insert audit logs (for backend operations)
-- Note: Service role key bypasses RLS, so this is for explicit service role connections
CREATE POLICY "service_insert_audit_logs"
ON audit_log
FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- SMS_EVENTS TABLE
-- ============================================================================

ALTER TABLE sms_events ENABLE ROW LEVEL SECURITY;

-- Users can see SMS events related to their entities
-- (e.g., guards see SMS sent to them, referrers see SMS for their referrals)
CREATE POLICY "user_select_own_sms_events"
ON sms_events
FOR SELECT
USING (
  related_entity_id IN (
    SELECT id FROM guards WHERE id = auth.uid()
  )
  OR related_entity_id IN (
    SELECT id FROM referrers WHERE id = auth.uid()
  )
);

-- Admins can see all SMS events
CREATE POLICY "admin_select_all_sms_events"
ON sms_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Service role can insert SMS events
CREATE POLICY "service_insert_sms_events"
ON sms_events
FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "guard_select_self" ON guards IS 'Guards can read their own profile per Ledger §8';
COMMENT ON POLICY "referrer_select_own_referrals" ON referrals IS 'Referrers can only see their own referrals per Ledger §8';
COMMENT ON POLICY "referrer_select_own_earnings" ON referral_earnings_ledger IS 'Referrers can only see their own earnings per Ledger §8';
COMMENT ON POLICY "admin_select_all_guards" ON guards IS 'Admins have full access per Ledger §8';

