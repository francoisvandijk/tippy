## Phase 1 — Database & Security Implementation

This pull request introduces the initial database schema, row-level security policies, audit triggers, seed data, tests, CI workflow, and documentation as outlined in the Tippy Decision Ledger v1.0 (§4, §8, §14, §25).

### Key additions

- **Database schema** for `admins`, `guards`, `guard_qr_cards`, and `audit_logs` tables with appropriate constraints and defaults (see `infra/db/migrations/0001_init.sql`).
- **Row-level security (RLS) policies** and POPIA enforcement to restrict data access to authorised roles and users (`infra/db/migrations/0002_policies.sql`).
- **Audit triggers** to log data changes into the `audit_logs` table (`infra/db/migrations/0003_triggers.sql`).
- **Seed data** to create an initial admin account (`infra/db/seed.sql`).
- **Vitest tests** verifying that admins can read all guard data, guards only see their own records, and no plain-text phone numbers leak into audit logs (`infra/db/tests/phase1.test.ts`).
- **GitHub Actions CI workflow** to run migrations, seed the database, and execute tests on push and pull requests (`.github/workflows/ci.yml`).
- **Documentation** placeholders for schema reference, RLS policy map, execution plan, evidence, and acceptance checklist (`docs/`).

### Checklist

- [x] Database schema matches §4 requirements
- [x] RLS and POPIA policies enforce §8 and §25
- [x] Audit logging implemented per §14
- [x] Seed data added
- [x] Tests passing locally
- [x] CI workflow defined
- [x] Documentation placeholders created

Please review the implementation for compliance with the ledger and provide feedback as per §18.
