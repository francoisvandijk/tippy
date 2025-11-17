-- Migration: 0000_schema_migrations.sql
-- Migration Tracking Table
-- This table tracks which migrations have been applied

-- Schema migrations table
-- Tracks applied migrations for idempotent migration execution
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64), -- Optional: SHA256 hash of migration file for verification
    execution_time_ms INTEGER -- Optional: execution time in milliseconds
);

-- Indexes
CREATE INDEX idx_schema_migrations_filename ON schema_migrations(filename);
CREATE INDEX idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- Comments
COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations for idempotent execution';
COMMENT ON COLUMN schema_migrations.filename IS 'Migration filename (e.g., 0001_users.sql)';
COMMENT ON COLUMN schema_migrations.checksum IS 'SHA256 hash of migration file content (optional verification)';

