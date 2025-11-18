// Database migration runner
// Ledger Reference: §15 (Environments & Deployment)
// P1.2: Complete Migration Runner - processes all 19 migration files sequentially

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';
import { getDbUrl } from './lib/db';

interface MigrationRecord {
  version: string;
  name: string;
  applied_at: Date;
}

/**
 * Get all migration files from the migrations directory, sorted numerically
 */
function getMigrationFiles(migrationsDir: string): string[] {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => {
      // Extract numeric prefix (e.g., "0004" from "0004_payments.sql")
      const numA = parseInt(a.split('_')[0], 10);
      const numB = parseInt(b.split('_')[0], 10);
      return numA - numB;
    });
  return files;
}

/**
 * Create schema_migrations table if it doesn't exist
 */
async function ensureSchemaMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/**
 * Get list of already applied migrations
 */
async function getAppliedMigrations(sql: postgres.Sql): Promise<Set<string>> {
  const records = await sql<MigrationRecord[]>`
    SELECT version, name, applied_at
    FROM schema_migrations
    ORDER BY version ASC
  `;
  return new Set(records.map((r) => r.version));
}

/**
 * Record a migration as applied
 */
async function recordMigration(
  sql: postgres.Sql,
  version: string,
  name: string
): Promise<void> {
  await sql`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES (${version}, ${name}, NOW())
    ON CONFLICT (version) DO NOTHING
  `;
}

/**
 * Remove a migration record (for rollback)
 */
async function removeMigrationRecord(
  sql: postgres.Sql,
  version: string
): Promise<void> {
  await sql`DELETE FROM schema_migrations WHERE version = ${version}`;
}

/**
 * Extract version number from filename (e.g., "0004" from "0004_payments.sql")
 */
function getVersionFromFilename(filename: string): string {
  return filename.split('_')[0];
}

/**
 * Execute a migration file
 */
async function executeMigration(
  sql: postgres.Sql,
  filePath: string,
  version: string,
  name: string
): Promise<void> {
  const sqlContent = readFileSync(filePath, 'utf-8');
  
  // Execute the SQL (postgres package supports multi-statement SQL)
  await sql.unsafe(sqlContent);
  
  // Record the migration
  await recordMigration(sql, version, name);
  
  console.log(`✅ Applied migration: ${version} - ${name}`);
}

/**
 * Rollback a specific migration (basic implementation)
 * Note: Full rollback requires down migrations, which are not implemented yet
 */
async function rollbackMigration(
  sql: postgres.Sql,
  version: string,
  name: string
): Promise<void> {
  console.log(`⚠️  Rollback requested for ${version} - ${name}`);
  console.log('⚠️  Note: Full rollback requires down migration scripts (not yet implemented)');
  console.log('⚠️  Migration record will be removed, but SQL changes must be manually reversed');
  
  await removeMigrationRecord(sql, version);
  console.log(`✅ Removed migration record: ${version}`);
}

/**
 * Run migrations in 'up' direction
 */
async function runMigrationsUp(sql: postgres.Sql, migrationsDir: string): Promise<void> {
  console.log('🔄 Running migrations (up)...\n');
  
  // Ensure schema_migrations table exists
  await ensureSchemaMigrationsTable(sql);
  
  // Get all migration files
  const files = getMigrationFiles(migrationsDir);
  console.log(`Found ${files.length} migration file(s)\n`);
  
  // Get already applied migrations
  const applied = await getAppliedMigrations(sql);
  console.log(`Already applied: ${applied.size} migration(s)\n`);
  
  // Apply pending migrations
  let appliedCount = 0;
  for (const file of files) {
    const version = getVersionFromFilename(file);
    const name = file.replace('.sql', '');
    
    if (applied.has(version)) {
      console.log(`⏭️  Skipping ${version} - ${name} (already applied)`);
      continue;
    }
    
    const filePath = join(migrationsDir, file);
    console.log(`🔄 Applying ${version} - ${name}...`);
    
    try {
      await executeMigration(sql, filePath, version, name);
      appliedCount++;
    } catch (error) {
      console.error(`❌ Failed to apply ${version} - ${name}:`, error);
      throw error;
    }
  }
  
  if (appliedCount === 0) {
    console.log('\n✅ All migrations are up to date');
  } else {
    console.log(`\n✅ Applied ${appliedCount} new migration(s)`);
  }
}

/**
 * Run migrations in 'down' direction (rollback)
 */
async function runMigrationsDown(
  sql: postgres.Sql,
  migrationsDir: string,
  targetVersion?: string
): Promise<void> {
  console.log('🔄 Rolling back migrations (down)...\n');
  
  // Get applied migrations (in reverse order)
  const applied = await getAppliedMigrations(sql);
  const appliedArray = Array.from(applied).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    return numB - numA; // Reverse order
  });
  
  if (appliedArray.length === 0) {
    console.log('✅ No migrations to rollback');
    return;
  }
  
  const files = getMigrationFiles(migrationsDir);
  const filesByVersion = new Map<string, string>();
  for (const file of files) {
    const version = getVersionFromFilename(file);
    filesByVersion.set(version, file);
  }
  
  let rolledBackCount = 0;
  for (const version of appliedArray) {
    if (targetVersion && version < targetVersion) {
      break;
    }
    
    const file = filesByVersion.get(version);
    if (!file) {
      console.log(`⚠️  Migration file not found for version ${version}, removing record only`);
      await removeMigrationRecord(sql, version);
      rolledBackCount++;
      continue;
    }
    
    const name = file.replace('.sql', '');
    await rollbackMigration(sql, version, name);
    rolledBackCount++;
    
    if (targetVersion && version === targetVersion) {
      break;
    }
  }
  
  if (rolledBackCount === 0) {
    console.log('\n✅ No migrations rolled back');
  } else {
    console.log(`\n✅ Rolled back ${rolledBackCount} migration(s)`);
  }
}

/**
 * Show migration status
 */
async function showStatus(sql: postgres.Sql, migrationsDir: string): Promise<void> {
  console.log('📊 Migration Status\n');
  
  await ensureSchemaMigrationsTable(sql);
  
  const files = getMigrationFiles(migrationsDir);
  const applied = await getAppliedMigrations(sql);
  
  console.log(`Total migration files: ${files.length}`);
  console.log(`Applied migrations: ${applied.size}`);
  console.log(`Pending migrations: ${files.length - applied.size}\n`);
  
  console.log('Migration Details:');
  for (const file of files) {
    const version = getVersionFromFilename(file);
    const name = file.replace('.sql', '');
    const status = applied.has(version) ? '✅ Applied' : '⏳ Pending';
    console.log(`  ${version} - ${name}: ${status}`);
  }
}

/**
 * Main migration runner
 */
async function main() {
  const direction = process.argv[2] || 'up';
  const targetVersion = process.argv[3]; // For rollback to specific version
  
  const migrationsDir = join(__dirname, '../infra/db/migrations');
  
  // Get database URL (masked in logs per Ledger §25)
  const dbUrl = getDbUrl();
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
  console.log(`📦 Database: ${maskedUrl}\n`);
  
  // Create postgres connection
  const sql = postgres(dbUrl, {
    max: 1, // Single connection for migrations
    onnotice: () => {}, // Suppress notices
  });
  
  try {
    if (direction === 'up') {
      await runMigrationsUp(sql, migrationsDir);
    } else if (direction === 'down') {
      await runMigrationsDown(sql, migrationsDir, targetVersion);
    } else if (direction === 'status') {
      await showStatus(sql, migrationsDir);
    } else {
      console.error(`Unknown direction: ${direction}`);
      console.error('Usage: npm run migrate [up|down|status] [target_version]');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as runMigrations };
