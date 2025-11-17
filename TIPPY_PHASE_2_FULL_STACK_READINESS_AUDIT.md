# Tippy Phase 2 Full-Stack Readiness Audit

**Date**: 2025-01-27  
**Auditor**: Tippy Phase 2 Full-Stack Readiness Audit Agent  
**Ledger Reference**: Tippy Decision Ledger v1.0 (Final)  
**Branch**: `feature/ledger-logging-policy`

---

## 1. Summary

**Overall Status**: ⚠️ **PARTIAL** — Core Phase 2 components implemented, but critical gaps remain

**High-Level Statement**: The Tippy project has implemented core Phase 2 functionality including payments, Yoco integration, auth/RLS, SMS service, and CI workflows. However, several critical components are missing or incomplete, preventing full Phase 2 readiness:

- ✅ **Implemented**: Payments API, Yoco integration, Auth middleware, RLS policies, SMS service, Fee calculations, Doppler CI workflow
- ❌ **Missing**: Guard registration endpoint, MSISDN hashing utilities, Audit logging implementation, Core database migrations (users, guards, referrers tables)
- ⚠️ **Incomplete**: Build errors, test failures, missing routes for guards/referrers/admin endpoints

**Readiness for Phase 3**: **NOT READY** — Critical gaps must be addressed before proceeding.

---

## 2. Checklist vs Ledger

### Phase 2 Requirements Derived from Ledger

#### Auth & RLS
- [x] **PASS** — Supabase Auth JWT verification (`src/lib/auth.ts`)
- [x] **PASS** — Role-based access control (admin, referrer, guard, internal)
- [x] **PASS** — RLS policies enabled (`infra/db/migrations/0019_rls_policies.sql`)
- [x] **PASS** — Auth middleware (`requireAuth`, `requireRole`)
- [ ] **FAIL** — Guard registration endpoint (`POST /guards/register`) — **MISSING**
- [ ] **FAIL** — Guard routes (`GET /guards/me`) — Only example file exists
- [ ] **FAIL** — Referrer routes (`GET /referrers/earnings/summary`, `GET /referrers/referrals`) — **MISSING**
- [ ] **FAIL** — Admin routes (most endpoints missing) — **MISSING**

#### POPIA / MSISDN
- [ ] **FAIL** — MSISDN hashing utility (`src/lib/utils.ts`) — **MISSING** (imported but file doesn't exist)
- [x] **PARTIAL** — SMS service uses hashing (but utils file missing, causing build error)
- [x] **PASS** — SMS events table structure (referenced in RLS migration)
- [ ] **FAIL** — MSISDN masking function — **MISSING**
- [ ] **FAIL** — MSISDN hashing before DB write — **NOT VERIFIED** (no implementation to verify)

#### Guard & Referrer Flows
- [ ] **FAIL** — Guard registration endpoint — **MISSING**
- [ ] **FAIL** — Welcome SMS trigger on registration — **CANNOT VERIFY** (no registration endpoint)
- [x] **PASS** — Welcome SMS service implemented (`src/lib/sms.ts`)
- [ ] **FAIL** — Referrer activation flow — **MISSING**
- [ ] **FAIL** — Referrer guard registration flow — **MISSING**

#### Yoco / Payments
- [x] **PASS** — Yoco client implementation (`src/lib/yoco.ts`)
- [x] **PASS** — Payment creation endpoint (`POST /payments/create`)
- [x] **PASS** — Yoco webhook handler (`POST /payments/webhook`)
- [x] **PASS** — Fee calculation logic (`src/lib/fees.ts`) — Matches Ledger §5
- [x] **PASS** — Payments table migration (`infra/db/migrations/0004_payments.sql`)
- [x] **PASS** — Payment reference generation (TPY- prefix)
- [ ] **PARTIAL** — Payment status updates (webhook implemented, but idempotency needs verification)

#### SMS & SendGrid
- [x] **PASS** — SendGrid SMS integration (`src/lib/sms.ts`)
- [x] **PASS** — Twilio fallback support
- [x] **PASS** — Welcome SMS message template (per §24.3)
- [x] **PASS** — SMS retry logic (3 attempts)
- [x] **PASS** — SMS events logging (to `sms_events` table)
- [ ] **FAIL** — SMS events table migration — **MISSING** (referenced in RLS but table creation not found)

#### Logging & Audit
- [ ] **FAIL** — Audit logging implementation (`src/lib/audit.ts`) — **MISSING**
- [x] **PASS** — Audit log table RLS policy (in migration)
- [ ] **FAIL** — Application logging policy compliance — **CANNOT VERIFY** (no audit lib)
- [x] **PASS** — No plaintext secrets in code (verified via grep)
- [ ] **PARTIAL** — Console.log usage (some present, but no structured logger)

#### CI & Doppler
- [x] **PASS** — Doppler CI workflow (`.github/workflows/doppler-ci.yml`)
- [x] **PASS** — Workflow triggers (workflow_dispatch, push, pull_request)
- [x] **PASS** — Doppler token usage (`DOPPLER_TOKEN_CI`)
- [x] **PASS** — Audit log file (`ops/doppler/AUDIT_LOG.txt`)
- [x] **PASS** — Governance docs (`docs/PHASE_2_GOVERNANCE_CLOSE_OUT.md`)
- [x] **PASS** — Phase 2 summary document

---

## 3. Code & API Verification

### Auth Implementation
**Status**: ✅ **PASS**

**Files**:
- `src/lib/auth.ts` — Complete JWT verification, role lookup, middleware
- `src/lib/db.ts` — Supabase client setup

**Evidence**:
- JWT verification using `SUPABASE_JWT_SECRET` (lines 47-71)
- Role lookup from `users` table (lines 106-128)
- `requireAuth`, `requireRole`, `optionalAuth` middleware (lines 135-196)
- Matches Ledger §8.1 requirements

**Issues**:
- TypeScript error: `requireRole` return type issue (lines 159, 167) — **BUILD ERROR**

### Payments API
**Status**: ✅ **PASS**

**Files**:
- `src/api/routes/payments.ts` — Payment creation endpoint
- `src/api/routes/yoco-webhook.ts` — Webhook handler
- `src/lib/yoco.ts` — Yoco client
- `src/lib/fees.ts` — Fee calculations

**Evidence**:
- `POST /payments/create` implemented (lines 28-168)
- Fee calculation matches Ledger §5 (processor, platform, VAT, net)
- Yoco charge creation (lines 81-90)
- Webhook signature verification (lines 23-29)
- Payment status updates (lines 62-83)

**Issues**:
- TypeScript error in `yoco.ts` (lines 81, 84) — **BUILD ERROR**

### SMS Service
**Status**: ⚠️ **PARTIAL**

**Files**:
- `src/lib/sms.ts` — SMS service implementation

**Evidence**:
- SendGrid integration (lines 171-224)
- Twilio fallback (lines 229-279)
- Welcome SMS function (lines 285-345)
- SMS events logging (lines 66-90)
- Retry logic with exponential backoff (lines 63-158)

**Issues**:
- **CRITICAL**: Missing `src/lib/utils.ts` (imported on line 8) — **BUILD ERROR**
- Cannot verify MSISDN hashing without utils file

### Guard Registration
**Status**: ❌ **FAIL**

**Files**:
- `src/api/routes/example-guards.ts` — Example only, not wired to server

**Evidence**:
- Example file exists but is not imported in `src/server.ts`
- No `POST /guards/register` endpoint
- No guard registration logic
- Welcome SMS cannot be triggered (no registration endpoint)

**Missing**:
- Guard registration route
- MSISDN validation
- Guard creation in database
- Welcome SMS trigger

### Missing Routes
**Status**: ❌ **FAIL**

**Missing Endpoints** (per Ledger §7):
- `GET /guards/me` — Only example file exists
- `POST /qr/reassign` — **MISSING**
- `POST /referrals/create` — **MISSING**
- `GET /referrers/earnings/summary` — **MISSING**
- `GET /referrers/referrals` — **MISSING**
- `POST /admin/payouts/generate` — **MISSING**
- `POST /admin/referral/reversal` — **MISSING**
- `POST /admin/qr/assign` — **MISSING**
- `POST /admin/settings/set` — **MISSING**
- `POST /admin/qr/bulk-generate` — **MISSING**
- `POST /admin/qr/export` — **MISSING**

### Server Configuration
**Status**: ⚠️ **PARTIAL**

**Files**:
- `src/server.ts` — Main server file

**Evidence**:
- Express app setup (lines 8-47)
- Payment routes wired (lines 27-28)
- Health check endpoint (lines 22-24)
- Error handling middleware (lines 31-37)

**Issues**:
- Only payment routes are wired
- No guard/referrer/admin routes
- No auth middleware applied to routes

---

## 4. Database & RLS Verification

### Migrations
**Status**: ⚠️ **PARTIAL**

**Files Found**:
- `infra/db/migrations/0004_payments.sql` — Payments table
- `infra/db/migrations/0019_rls_policies.sql` — RLS policies

**Missing Migrations** (per Ledger §4):
- `users` table creation — **MISSING**
- `guards` table creation — **MISSING**
- `referrers` table creation — **MISSING**
- `qr_codes` table creation — **MISSING**
- `referrals` table creation — **MISSING**
- `referral_earnings_ledger` table creation — **MISSING**
- `payout_batches` table creation — **MISSING**
- `payout_batch_items` table creation — **MISSING**
- `sms_events` table creation — **MISSING**
- `audit_log` table creation — **MISSING**
- `app_settings` table creation — **MISSING**

**Note**: RLS migration (0019) references tables that should exist but their creation migrations are missing. This suggests either:
1. Tables were created manually/outside migrations
2. Migrations are in a different location
3. Migrations are missing

### Payments Table
**Status**: ✅ **PASS**

**Migration**: `infra/db/migrations/0004_payments.sql`

**Schema Verification**:
- ✅ All required columns present (amount_gross, processor_fee, platform_fee, vat_on_platform, amount_net)
- ✅ Foreign keys to guards, qr_codes, users
- ✅ Indexes on guard_id, qr_code_id, status, yoco_charge_id
- ✅ Fee calculation function (lines 83-115)
- ✅ Matches Ledger §4 and §5 requirements

### RLS Policies
**Status**: ✅ **PASS**

**Migration**: `infra/db/migrations/0019_rls_policies.sql`

**Policies Verified**:
- ✅ Guards: `guard_select_self`, `guard_update_self`
- ✅ Referrers: `referrer_select_self`, `referrer_select_own_referrals`
- ✅ Admins: `admin_select_all_*` policies
- ✅ Payments: `guard_select_own_payments`, `public_create_payments`
- ✅ RLS enabled on: guards, referrers, referrals, referral_earnings_ledger, payments, payout_batches, payout_batch_items, qr_codes, users, audit_log, sms_events

**Compliance**: Matches Ledger §8 requirements

### Table-by-Table Summary

| Table | Migration | RLS | Key Columns | Status |
|-------|-----------|-----|-------------|--------|
| `users` | ❌ Missing | ✅ Enabled | `id`, `role`, `email`, `msisdn` | ⚠️ **MIGRATION MISSING** |
| `guards` | ❌ Missing | ✅ Enabled | `id`, `display_name`, `msisdn` | ⚠️ **MIGRATION MISSING** |
| `referrers` | ❌ Missing | ✅ Enabled | `id`, `role`, `display_name`, `msisdn` | ⚠️ **MIGRATION MISSING** |
| `payments` | ✅ 0004 | ✅ Enabled | All fee fields, yoco_charge_id | ✅ **PASS** |
| `qr_codes` | ❌ Missing | ✅ Enabled | `id`, `code`, `assigned_guard_id` | ⚠️ **MIGRATION MISSING** |
| `referrals` | ❌ Missing | ✅ Enabled | `referrer_id`, `guard_id` | ⚠️ **MIGRATION MISSING** |
| `sms_events` | ❌ Missing | ✅ Enabled | `recipient_msisdn_hash`, `recipient_msisdn_masked` | ⚠️ **MIGRATION MISSING** |
| `audit_log` | ❌ Missing | ✅ Enabled | `actor_user_id`, `action` | ⚠️ **MIGRATION MISSING** |

### POPIA: MSISDN Hashing & Sensitive Data
**Status**: ❌ **FAIL**

**Findings**:
- ❌ **CRITICAL**: `src/lib/utils.ts` file is **MISSING**
  - Imported in `src/lib/sms.ts` line 8: `import { hashPhoneNumber, maskPhoneNumber } from './utils';`
  - Causes build failure
- ✅ SMS service attempts to hash/mask (lines 52-53 in `sms.ts`)
- ❌ Cannot verify hashing implementation (file doesn't exist)
- ❌ No MSISDN hashing utility functions found
- ⚠️ Console.log usage present (but no raw MSISDN logged in reviewed code)

**Required Functions** (per Ledger §13, §25):
- `hashPhoneNumber(msisdn: string): string` — SHA256 hash
- `maskPhoneNumber(msisdn: string): string` — Format: `xxxxxx1234`

**Recommendation**: Create `src/lib/utils.ts` with MSISDN hashing/masking functions before proceeding.

---

## 5. Tests & Tooling

### Test Commands

| Command | Status | Notes |
|---------|--------|-------|
| `npm test` | ❌ **FAIL** | 2 test suites failed (auth.test.ts, payments.test.ts) |
| `npm run build` | ❌ **FAIL** | 5 TypeScript errors |
| `npm run lint` | ⚠️ **NOT FOUND** | No lint script in package.json |
| `npm run typecheck` | ⚠️ **NOT FOUND** | No typecheck script (use `tsc --noEmit`) |

### Test Results

**Auth Tests** (`tests/api/auth.test.ts`):
- ❌ **FAIL** — Mock initialization error
- Error: `ReferenceError: Cannot access 'mockSupabase' before initialization`
- Issue: Mock hoisting problem in vitest

**Payments Tests** (`tests/api/payments.test.ts`):
- ❌ **FAIL** — YocoClient mock constructor error
- Error: `is not a constructor`
- Issue: Mock factory function not returning constructor

**Yoco Tests** (`tests/yoco.test.ts`):
- ⚠️ **PARTIAL** — 3/4 tests passing
- ❌ 1 test failing: webhook signature verification

### Test Coverage Gaps

**Missing Test Coverage**:
- ❌ Guard registration flow
- ❌ MSISDN hashing behavior
- ❌ RLS policy enforcement (integration tests)
- ❌ Welcome SMS trigger
- ❌ Referrer endpoints
- ❌ Admin endpoints
- ❌ Audit logging

### Build Errors

**TypeScript Compilation Errors**:
1. `src/api/routes/example-guards.ts:29` — `Cannot find name 'supabase'`
2. `src/lib/auth.ts:159,167` — Return type mismatch in `requireRole`
3. `src/lib/sms.ts:8` — `Cannot find module './utils'`
4. `src/lib/yoco.ts:81,84` — Type errors with `unknown` type

**Impact**: Project cannot be built or deployed until these errors are resolved.

---

## 6. CI & Governance

### Doppler CI Workflow
**Status**: ✅ **PASS**

**File**: `.github/workflows/doppler-ci.yml`

**Verification**:
- ✅ Triggers: `workflow_dispatch`, `push`, `pull_request` (matches Ledger §19.5.1)
- ✅ Doppler CLI installation (lines 16-19)
- ✅ Uses `DOPPLER_TOKEN_CI` secret (line 22)
- ✅ Runs on ubuntu-latest (line 10)
- ✅ Matches Ledger §19.5 requirements

**Evidence**: Audit log shows successful CI runs (see `ops/doppler/AUDIT_LOG.txt`)

### Governance Documents
**Status**: ✅ **PASS**

**Files Present**:
- ✅ `docs/TIPPY_DECISION_LEDGER.md` — Ledger v1.0 (Final)
- ✅ `docs/PHASE_2_GOVERNANCE_CLOSE_OUT.md` — Phase 2 close-out summary
- ✅ `ops/doppler/AUDIT_LOG.txt` — Doppler CI audit log
- ✅ `docs/phase2-checklist.md` — Phase 2 checklist
- ✅ `docs/GOVERNANCE.md` — Governance documentation

**Compliance**: Matches Ledger §19.9.4 requirements

### Secrets Management
**Status**: ✅ **PASS**

**Verification**:
- ✅ No plaintext secrets in code (verified via grep)
- ✅ Environment variables used (SUPABASE_*, YOCO_*, SENDGRID_*)
- ✅ Doppler CI workflow uses secrets from GitHub Actions
- ✅ Matches Ledger §25 requirements

---

## 7. Risks & Recommendations

### Critical (Must Fix Before Proceeding)

#### C1: Missing MSISDN Hashing Utilities
**Severity**: 🔴 **CRITICAL**

**Description**: `src/lib/utils.ts` is missing but imported by `src/lib/sms.ts`, causing build failure and preventing MSISDN hashing per POPIA requirements.

**Evidence**:
- `src/lib/sms.ts:8` — Import statement
- Build error: `Cannot find module './utils'`
- Ledger §13.3, §25 require MSISDN hashing

**Recommended Action**:
1. Create `src/lib/utils.ts` with:
   - `hashPhoneNumber(msisdn: string): string` — SHA256 hash
   - `maskPhoneNumber(msisdn: string): string` — Format `xxxxxx1234`
2. Verify all MSISDN writes use hashing
3. Test build succeeds

**Estimated Effort**: 1-2 hours

---

#### C2: Missing Core Database Migrations
**Severity**: 🔴 **CRITICAL**

**Description**: RLS migration (0019) references tables (`users`, `guards`, `referrers`, `qr_codes`, `referrals`, `sms_events`, `audit_log`, etc.) but their creation migrations are missing.

**Evidence**:
- Only `0004_payments.sql` and `0019_rls_policies.sql` exist
- RLS policies reference 11+ tables that have no creation migrations
- Cannot apply RLS migration without tables existing

**Recommended Action**:
1. Create migrations for all core tables per Ledger §4:
   - `0001_users.sql`
   - `0002_guards.sql`
   - `0003_referrers.sql`
   - `0005_qr_codes.sql`
   - `0006_referrals.sql`
   - `0007_sms_events.sql`
   - `0008_audit_log.sql`
   - etc.
2. Ensure migrations include `msisdn_hash` columns where required
3. Verify migration order (RLS must come after table creation)

**Estimated Effort**: 4-6 hours

---

#### C3: Missing Guard Registration Endpoint
**Severity**: 🔴 **CRITICAL**

**Description**: `POST /guards/register` endpoint is missing, preventing guard registration and Welcome SMS trigger per Ledger §24.3.

**Evidence**:
- Ledger §24.3 requires Welcome SMS on guard registration
- `src/lib/sms.ts` has `sendWelcomeSms()` function but no trigger
- Only example file exists (`src/api/routes/example-guards.ts`)

**Recommended Action**:
1. Create `src/api/routes/guards.ts` with:
   - `POST /guards/register` — Register guard (admin/referrer only)
   - `GET /guards/me` — Get own profile (guard only)
2. Implement MSISDN validation and hashing
3. Trigger Welcome SMS on successful registration
4. Wire route in `src/server.ts`
5. Add auth middleware (`requireAuth`, `requireRole('admin', 'referrer')`)

**Estimated Effort**: 3-4 hours

---

#### C4: Build Errors Blocking Deployment
**Severity**: 🔴 **CRITICAL**

**Description**: 5 TypeScript compilation errors prevent project from building.

**Evidence**:
- `npm run build` fails with 5 errors
- Errors in: `example-guards.ts`, `auth.ts`, `sms.ts`, `yoco.ts`

**Recommended Action**:
1. Fix `src/api/routes/example-guards.ts:29` — Import `supabase` from `../../lib/db`
2. Fix `src/lib/auth.ts:159,167` — Correct `requireRole` return type
3. Create `src/lib/utils.ts` (see C1)
4. Fix `src/lib/yoco.ts:81,84` — Handle `unknown` type properly

**Estimated Effort**: 1-2 hours

---

### High Priority

#### H1: Missing Audit Logging Implementation
**Severity**: 🟠 **HIGH**

**Description**: No audit logging library found. Ledger §13 requires audit logging for sensitive events.

**Evidence**:
- No `src/lib/audit.ts` file
- RLS migration references `audit_log` table but no code writes to it
- Ledger §13 requires audit logging

**Recommended Action**:
1. Create `src/lib/audit.ts` with:
   - `logAuditEvent(action, entity, metadata)` function
   - Writes to `audit_log` table
   - Masks PII per Ledger §13.6
2. Integrate into payment, guard registration, admin operations
3. Verify no plaintext MSISDN in audit logs

**Estimated Effort**: 2-3 hours

---

#### H2: Missing API Routes
**Severity**: 🟠 **HIGH**

**Description**: Most API endpoints per Ledger §7 are missing.

**Missing Routes**:
- Guard: `GET /guards/me`, `POST /qr/reassign`
- Referrer: `POST /referrals/create`, `GET /referrers/earnings/summary`, `GET /referrers/referrals`
- Admin: All admin endpoints missing

**Recommended Action**:
1. Implement guard routes (`src/api/routes/guards.ts`)
2. Implement referrer routes (`src/api/routes/referrers.ts`)
3. Implement admin routes (`src/api/routes/admin.ts`)
4. Wire all routes in `src/server.ts`
5. Apply appropriate auth middleware

**Estimated Effort**: 8-12 hours

---

#### H3: Test Failures
**Severity**: 🟠 **HIGH**

**Description**: Test suite has failures preventing CI validation.

**Evidence**:
- Auth tests fail due to mock initialization
- Payments tests fail due to YocoClient mock
- 1 Yoco test failing

**Recommended Action**:
1. Fix vitest mock hoisting in `tests/api/auth.test.ts`
2. Fix YocoClient mock in `tests/api/payments.test.ts`
3. Fix webhook signature test in `tests/yoco.test.ts`
4. Add missing test coverage (see Test Coverage Gaps)

**Estimated Effort**: 2-4 hours

---

### Medium Priority

#### M1: Missing Lint/Typecheck Scripts
**Severity**: 🟡 **MEDIUM**

**Description**: No lint or typecheck scripts in `package.json`.

**Recommended Action**:
1. Add `lint` script (ESLint)
2. Add `typecheck` script (`tsc --noEmit`)
3. Add pre-commit hooks for linting

**Estimated Effort**: 1 hour

---

#### M2: Console.log Usage
**Severity**: 🟡 **MEDIUM**

**Description**: Some `console.log` usage present. Ledger §13.6 discourages in application runtime.

**Evidence**:
- `src/server.ts:17,32,42` — Request logging, error logging
- `src/lib/auth.ts:143,166` — Error logging

**Recommended Action**:
1. Replace with structured logger (e.g., Winston, Pino)
2. Ensure no PII/secrets in logs
3. Use structured JSON format per Ledger §12.1

**Estimated Effort**: 2-3 hours

---

### Low Priority / Nice-to-Have

#### L1: Missing TypeScript Strict Mode
**Severity**: 🔵 **LOW**

**Description**: TypeScript errors suggest strict mode may not be enabled.

**Recommended Action**:
1. Enable `strict: true` in `tsconfig.json`
2. Fix resulting type errors

**Estimated Effort**: 1-2 hours

---

#### L2: Missing API Documentation
**Severity**: 🔵 **LOW**

**Description**: No OpenAPI/Swagger documentation for API endpoints.

**Recommended Action**:
1. Add OpenAPI specification
2. Generate API docs

**Estimated Effort**: 2-3 hours

---

## 8. Conclusion

### Overall Assessment

The Tippy project has **solid foundations** for Phase 2 with core payments, auth, and SMS infrastructure in place. However, **critical gaps** prevent full Phase 2 readiness:

**Strengths**:
- ✅ Payments API and Yoco integration complete
- ✅ Auth middleware and RLS policies implemented
- ✅ SMS service with SendGrid/Twilio support
- ✅ Fee calculations match Ledger requirements
- ✅ CI workflow and governance docs in place

**Critical Gaps**:
- ❌ Missing MSISDN hashing utilities (blocks build)
- ❌ Missing core database migrations (blocks RLS)
- ❌ Missing guard registration endpoint (blocks Phase 2 workflow)
- ❌ Build errors (blocks deployment)
- ❌ Missing most API routes (incomplete Phase 2 scope)

### Recommendation

**Status**: ⚠️ **NOT READY FOR PHASE 3**

**Required Actions Before Phase 3**:
1. **Fix Critical Issues** (C1-C4) — Estimated 9-14 hours
2. **Address High Priority** (H1-H3) — Estimated 12-19 hours
3. **Verify End-to-End** — Guard registration → Welcome SMS → Payment flow
4. **Run Full Test Suite** — All tests passing
5. **Complete Build** — No TypeScript errors

**Total Estimated Effort**: 21-33 hours

### Next Steps

1. Create `src/lib/utils.ts` with MSISDN hashing/masking
2. Create missing database migrations
3. Implement guard registration endpoint
4. Fix build errors
5. Implement missing API routes
6. Add audit logging
7. Fix test failures
8. Re-run full audit

---

**Audit Completed**: 2025-01-27  
**Next Review**: After critical issues resolved

---

*This audit is governed by Tippy Decision Ledger v1.0 (Final). Ledger = Law — no assumptions, no deviations.*



