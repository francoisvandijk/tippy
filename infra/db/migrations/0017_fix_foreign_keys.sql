-- Migration: 0017_fix_foreign_keys.sql
-- Fix Foreign Key References
-- This migration adds missing foreign key constraints after all base tables are created

-- Fix guards.referred_by_referrer_id to reference referrers table
-- (This FK was deferred because referrers table is created after guards)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'guards_referred_by_referrer_id_fkey'
    ) THEN
        ALTER TABLE guards 
        ADD CONSTRAINT guards_referred_by_referrer_id_fkey 
        FOREIGN KEY (referred_by_referrer_id) 
        REFERENCES referrers(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Fix qr_codes.batch_id to reference qr_batches table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'qr_codes_batch_id_fkey'
    ) THEN
        ALTER TABLE qr_codes 
        ADD CONSTRAINT qr_codes_batch_id_fkey 
        FOREIGN KEY (batch_id) 
        REFERENCES qr_batches(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Fix qr_batches.qr_design_id to reference qr_designs table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'qr_batches_qr_design_id_fkey'
    ) THEN
        ALTER TABLE qr_batches 
        ADD CONSTRAINT qr_batches_qr_design_id_fkey 
        FOREIGN KEY (qr_design_id) 
        REFERENCES qr_designs(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Comments
COMMENT ON CONSTRAINT guards_referred_by_referrer_id_fkey ON guards IS 'Foreign key to referrer who referred this guard';
COMMENT ON CONSTRAINT qr_codes_batch_id_fkey ON qr_codes IS 'Foreign key to QR batch this code belongs to';
COMMENT ON CONSTRAINT qr_batches_qr_design_id_fkey ON qr_batches IS 'Foreign key to QR design template used for this batch';

