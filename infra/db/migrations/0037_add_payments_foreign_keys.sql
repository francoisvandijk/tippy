-- Migration: 0037_add_payments_foreign_keys.sql
-- Phase 2: Add Foreign Key Constraints to Payments Table
-- Ledger Reference: Tippy Decision Ledger v1.0 (Final), §4 (Data Model)
--
-- This migration adds foreign key constraints to the payments table
-- that were deferred from 0004_payments.sql to avoid dependency issues.
-- All referenced tables (users, guards, qr_codes, payout_batches) now exist.

-- Add foreign key constraint for guards
ALTER TABLE payments
ADD CONSTRAINT payments_guard_id_fkey
FOREIGN KEY (guard_id) REFERENCES guards(id) ON DELETE RESTRICT;

-- Add foreign key constraint for qr_codes
ALTER TABLE payments
ADD CONSTRAINT payments_qr_code_id_fkey
FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE SET NULL;

-- Add foreign key constraint for users
ALTER TABLE payments
ADD CONSTRAINT payments_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add foreign key constraint for payout_batches
ALTER TABLE payments
ADD CONSTRAINT payments_payout_batch_id_fkey
FOREIGN KEY (payout_batch_id) REFERENCES payout_batches(id) ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON CONSTRAINT payments_guard_id_fkey ON payments IS 'Foreign key to guards table per Ledger §4';
COMMENT ON CONSTRAINT payments_qr_code_id_fkey ON payments IS 'Foreign key to qr_codes table per Ledger §4';
COMMENT ON CONSTRAINT payments_user_id_fkey ON payments IS 'Foreign key to users table per Ledger §4';
COMMENT ON CONSTRAINT payments_payout_batch_id_fkey ON payments IS 'Foreign key to payout_batches table per Ledger §4';
