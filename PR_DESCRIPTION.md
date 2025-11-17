# feat: Core Database Schema and Migration Runner

## Summary

This PR implements **P1.1 (Core Database Schema + Migrations)** and **P2.1 (.env.example)** from the Full-Stack Readiness Audit (2025-01-27).

### What Changed

1. **Core Database Schema** — Created 17 migration files implementing all required tables per Ledger §4:
   - Base tables: `users`, `guards`, `qr_codes`
   - Referral system: `referrers`, `referrals`, `referral_milestones`, `referral_earnings_ledger`, `referral_balances` (view)
   - Payout system: `payout_batches`, `payout_batch_items`
   - Audit & config: `sms_events`, `audit_log`, `app_settings`, `guard_registration_events`
   - QR batch system: `qr_batches`, `qr_designs`
   - Migration tracking: `schema_migrations`

2. **Migration Runner** — Upgraded `src/migrate.ts` from "print SQL" to actual SQL execution:
   - Connects to Postgres via `SUPABASE_DB_URL`
   - Tracks applied migrations in `schema_migrations` table
   - Idempotent: skips already-applied migrations
   - Transactional: each migration runs in a transaction
   - Includes checksum verification and execution time tracking

3. **Environment Template** — Added `.env.example` with all required environment variables per Ledger §15.3 and §25.3

4. **Dependencies** — Added `pg` and `@types/pg` for direct Postgres connections

## New Tables

| Table | Purpose | Ledger Reference |
|-------|---------|------------------|
| `users` | Base identity for all system users | §4 |
| `guards` | Guard profiles with earnings tracking | §4, §26 |
| `qr_codes` | QR code assignments to guards | §4, §6.4, §24.5 |
| `payout_batches` | Weekly payout batch runs | §4, §9 |
| `payout_batch_items` | Individual payout line items | §4, §9 |
| `referrers` | Referrer profiles | §4, §24.4 |
| `referrals` | Referral relationships | §4, §10, §24.4 |
| `referral_milestones` | R500 milestone tracking | §4, §10.2 |
| `referral_earnings_ledger` | Immutable earnings event log | §4, §10.4 |
| `referral_balances` | View for accrued referral totals | §4, §10.3 |
| `sms_events` | SMS sending audit log | §4, §24.3 |
| `audit_log` | System-wide immutable audit trail | §4, §25 |
| `app_settings` | Admin-editable configuration store | §3, §4 |
| `guard_registration_events` | Guard registration audit trail | §4, §24.4.6 |
| `qr_batches` | Bulk QR generation batches | §4, §24.5 |
| `qr_designs` | QR card design templates | §4, §24.5 |

## How to Run Migrations

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build TypeScript:
   ```bash
   npm run build
   ```

3. Set environment variable:
   ```bash
   export SUPABASE_DB_URL="postgresql://user:password@host:port/database"
   # Or on Windows:
   $env:SUPABASE_DB_URL="postgresql://user:password@host:port/database"
   ```

### Run Migrations

```bash
npm run migrate
# Or explicitly:
npm run migrate:up
```

The migration runner will:
- Connect to the database
- Create `schema_migrations` table if it doesn't exist
- Scan `infra/db/migrations/` for SQL files
- Apply only pending migrations in order
- Record each applied migration with checksum and execution time

### Verify Schema

After running migrations, you can verify the schema:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check applied migrations
SELECT filename, applied_at, execution_time_ms 
FROM schema_migrations 
ORDER BY applied_at;
```

## Foreign Key Relationships

The migrations establish the following key relationships:

- `guards.id` → `users.id` (one-to-one)
- `referrers.id` → `users.id` (one-to-one)
- `payments.guard_id` → `guards.id`
- `payments.qr_code_id` → `qr_codes.id`
- `payments.payout_batch_id` → `payout_batches.id`
- `referrals.referrer_id` → `referrers.id`
- `referrals.referred_guard_id` → `guards.id`
- `referral_milestones.referral_id` → `referrals.id`
- `referral_earnings_ledger.referrer_id` → `referrers.id`
- `payout_batch_items.payout_batch_id` → `payout_batches.id`
- `guard_registration_events.guard_id` → `guards.id`
- `qr_codes.batch_id` → `qr_batches.id`
- `qr_batches.qr_design_id` → `qr_designs.id`

## Default Settings

The `app_settings` table is pre-populated with default values from Ledger §3:
- Payment provider: Yoco
- Platform fee: 10.00%
- VAT rate: 15.00%
- CashSend fee: R9.00
- Payout minimum: R500.00
- Referral reward: R20.00
- Referral threshold: R500.00
- QR replacement fee: R10.00
- Reference prefix: TPY

## Compliance

✅ **Ledger §4** — All required tables implemented  
✅ **Ledger §15.3** — `.env.example` created  
✅ **Ledger §25** — No secrets in code, all via environment variables  
✅ **Full-Stack Audit P1.1** — Core database schema complete  
✅ **Full-Stack Audit P2.1** — Environment template complete  

## Follow-Up Items

This PR only implements the database schema. Future PRs will implement:

- API endpoints to populate these tables (P1.2)
- SMS integration using `sms_events` table (P1.3)
- Referral system logic using referral tables (P1.4)
- Payout system using payout tables (P1.5)
- Authentication/authorization (P1.6)

## Testing

To test migrations locally:

1. Set up a local Postgres database or use Supabase local development
2. Set `SUPABASE_DB_URL` environment variable
3. Run `npm run build && npm run migrate`
4. Verify tables are created and foreign keys are valid

## Breaking Changes

⚠️ **None** — This is a new schema implementation. The existing `payments` table migration (0004) now has valid foreign key references.

## References

- **Full-Stack Readiness Audit**: `docs/FULL_STACK_READINESS_AUDIT.md` (2025-01-27)
- **Ledger**: `docs/TIPPY_DECISION_LEDGER.md` v1.0 (Final)
- **Audit Gaps**: P1.1 (Core DB Schema), P2.1 (Environment Template)

---

**Created**: 2025-01-27  
**Branch**: `feat/core-database-schema`  
**Target**: `main`  
**Status**: Ready for Review

