// Database migration runner
// Ledger Reference: §15 (Environments & Deployment)
// Upgraded to actually execute migrations per Full-Stack Audit P1.1

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { Client } from 'pg';
import { getDbUrl } from './lib/db';
import { createHash } from 'crypto';

interface MigrationRecord {
  filename: string;
  applied_at: Date;
  checksum?: string;
  execution_time_ms?: number;
}

async function runMigrations() {
  const direction = process.argv[2] || 'up';
  const dbUrl = getDbUrl();
  
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    if (direction === 'up') {
      await runMigrationsUp(client);
    } else if (direction === 'down') {
      console.log('Rollback not yet implemented. Use manual SQL if needed.');
      process.exit(1);
    } else {
      console.error(`Unknown direction: ${direction}. Use 'up' or 'down'.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function runMigrationsUp(client: Client) {
  // Ensure schema_migrations table exists
  const migrationsDir = join(__dirname, '../infra/db/migrations');
  const schemaMigrationsSql = readFileSync(
    join(migrationsDir, '0000_schema_migrations.sql'),
    'utf-8'
  );
  
  // Execute schema_migrations table creation (idempotent)
  await client.query(schemaMigrationsSql);
  console.log('✓ Migration tracking table ready');

  // Get list of migration files
  const migrationFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file !== '0000_schema_migrations.sql')
    .sort();

  console.log(`Found ${migrationFiles.length} migration files`);

  // Get already applied migrations
  const appliedResult = await client.query<MigrationRecord>(
    'SELECT filename, checksum, execution_time_ms FROM schema_migrations ORDER BY filename'
  );
  const appliedMigrations = new Set(appliedResult.rows.map(r => r.filename));

  // Apply pending migrations
  let appliedCount = 0;
  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) {
      console.log(`⏭  Skipping ${filename} (already applied)`);
      continue;
    }

    const filePath = join(migrationsDir, filename);
    const sql = readFileSync(filePath, 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex').substring(0, 16);

    console.log(`▶  Applying ${filename}...`);
    const startTime = Date.now();

    try {
      // Execute migration in a transaction
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');

      const executionTime = Date.now() - startTime;

      // Record migration
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum, execution_time_ms) VALUES ($1, $2, $3)',
        [filename, checksum, executionTime]
      );

      console.log(`✓ Applied ${filename} (${executionTime}ms)`);
      appliedCount++;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Failed to apply ${filename}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  if (appliedCount === 0) {
    console.log('✓ All migrations already applied');
  } else {
    console.log(`\n✓ Successfully applied ${appliedCount} migration(s)`);
  }
}

// Run migrations if executed directly
if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('Fatal migration error:', error);
    process.exit(1);
  });
}

export { runMigrations };
