// Database migration runner
// Ledger Reference: §15 (Environments & Deployment)

import { readFileSync } from 'fs';
import { join } from 'path';
import { getDbUrl } from './lib/db';

async function runMigration() {
  const direction = process.argv[2] || 'up';
  const migrationFile = join(__dirname, '../infra/db/migrations/0004_payments.sql');

  if (direction === 'up') {
    console.log('Running migration: 0004_payments.sql');
    const sql = readFileSync(migrationFile, 'utf-8');
    
    // In a real implementation, you would execute this SQL against the database
    // For now, we'll just log it
    console.log('Migration SQL:');
    console.log(sql);
    console.log('\nNote: Execute this SQL manually against your Supabase Postgres database.');
    console.log('Database URL:', getDbUrl().replace(/:[^:@]+@/, ':****@')); // Mask password
  } else if (direction === 'down') {
    console.log('Rollback migration: 0004_payments.sql');
    console.log('DROP TABLE IF EXISTS payments CASCADE;');
    console.log('DROP FUNCTION IF EXISTS calculate_payment_fees CASCADE;');
    console.log('DROP FUNCTION IF EXISTS update_payments_updated_at CASCADE;');
  }
}

runMigration().catch(console.error);

