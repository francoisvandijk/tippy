// Database client setup
// Uses Supabase Postgres per Ledger §1.6

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.DB_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Database credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY or DB_URL environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Direct Postgres connection for migrations (if needed)
export function getDbUrl(): string {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DB_URL || '';
  if (!dbUrl) {
    throw new Error(
      'Database URL not configured. Set SUPABASE_DB_URL or DB_URL environment variable.'
    );
  }
  return dbUrl;
}
