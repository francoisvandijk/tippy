# PR Review Report: P2 — Referral Milestone Automation (R500 → R20 reward)

**Reviewer**: Tippy Governance Review Agent  
**PR Branch**: `feature/p2-referral-milestone-reward`  
**Base Branch**: `main`  
**Review Date**: 2025-11-20  
**Ledger Reference**: Tippy Decision Ledger v1.0 (Final)

---

## Verdict

**PASS WITH NITS** ✅

This PR successfully implements the Ledger-mandated referral milestone automation with proper idempotency, security, and compliance. Minor non-blocking suggestions are provided below.

---

## Summary

- ✅ **Scope Verification**: PR only modifies expected files (migration, referral logic, admin endpoint, tests, pr_body.txt). No Ledger modifications, no CI/workflow changes, no secrets config changes.
- ✅ **Ledger Compliance**: Implementation correctly follows §10.2 (R500 threshold, R20 reward), §9 (payout integration), §3 (env config), and §13.6 (POPIA-safe logging).
- ✅ **Database & RPC**: Transactional RPC with proper idempotency via `ON CONFLICT (referral_id) DO NOTHING` and unique constraint. All amounts in cents. No RLS bypasses.
- ✅ **Application Logic**: Env-driven config with correct defaults (R500/R20), proper ZAR→cents conversion, eligibility filtering prevents double-awards, uses RPC (no raw SQL), admin-only endpoint.
- ✅ **Tests**: Comprehensive coverage including progression scenarios, edge cases, RPC call verification. All 83 tests pass. Build succeeds.
- ✅ **Security & POPIA**: No MSISDN/PII logged, no secrets introduced, admin-only auth enforced, RLS respected.
- ⚠️ **Minor**: One duplicate test case removed (non-blocking), `console.info` used (acceptable per §13.6 for structured logging).

---

## 1. Scope & Diff Verification

### ✅ Confirmed Changes (Expected)

| File | Status | Notes |
|------|--------|-------|
| `infra/db/migrations/0039_referral_milestone_award_function.sql` | ✅ | New RPC function for milestone awards |
| `src/lib/referrals.ts` | ✅ | New helper functions for milestone processing |
| `src/api/routes/admin.ts` | ✅ | Integration into payout generation endpoint |
| `tests/lib/referrals.test.ts` | ✅ | Unit tests for eligibility logic |
| `tests/api/admin-payouts.test.ts` | ✅ | Integration tests for milestone RPC calls |
| `tests/api/{auth,guards,payments,qr-reassign,referrers-earnings-summary}.test.ts` | ✅ | Supabase mock updates (added `.rpc` only) |
| `pr_body.txt` | ✅ | PR description |

### ✅ Verified No Changes To

- ✅ `docs/TIPPY_DECISION_LEDGER.md` — **No modifications** (git diff confirms empty)
- ✅ Doppler / secrets config files
- ✅ CI / workflow files (`.github/workflows/`)
- ✅ Other unrelated routes or libs

**Conclusion**: Scope is clean and limited to the feature implementation.

---

## 2. Ledger Compliance

### ✅ Referral Milestone Requirements (§10.2)

| Requirement | Ledger Reference | Implementation | Status |
|------------|-----------------|----------------|--------|
| **Threshold** | R500 gross tips | `REFERRAL_TIP_THRESHOLD_ZAR` (default: 50000 cents) | ✅ Correct |
| **Reward** | R20 per milestone | `REFERRAL_FEE_PER_GUARD_ZAR` (default: 2000 cents) | ✅ Correct |
| **One-time per referral** | §10.2 | Unique constraint on `referral_milestones(referral_id)` + RPC `ON CONFLICT DO NOTHING` | ✅ Correct |
| **Trigger point** | §9 (Payouts) | Executed in `POST /admin/payouts/generate-weekly` before payout generation | ✅ Correct |
| **Units** | Cents convention | All amounts stored/processed in cents (50000 = R500, 2000 = R20) | ✅ Correct |

### ✅ Config Alignment (§3)

- ✅ `REFERRAL_TIP_THRESHOLD_ZAR` defaults to 50000 cents (R500) — **matches Ledger §3**
- ✅ `REFERRAL_FEE_PER_GUARD_ZAR` defaults to 2000 cents (R20) — **matches Ledger §3**
- ✅ Code supports fallback env vars (`REFERRAL_MILESTONE_THRESHOLD_ZAR`, `REFERRAL_MILESTONE_REWARD_ZAR`) for flexibility
- ✅ No hard-coded deviations from Ledger values

### ✅ Ledger Text Integrity

- ✅ **No Ledger modifications** — git diff confirms `docs/TIPPY_DECISION_LEDGER.md` unchanged
- ✅ Implementation compatible with existing Ledger sections (§4, §6.5, §9, §10, §13.6)

**Conclusion**: Full Ledger compliance. No deviations found.

---

## 3. Database & RPC Review

### ✅ Migration: `0039_referral_milestone_award_function.sql`

#### Function Design
- ✅ **Transactional**: Single RPC function handles all milestone operations atomically
- ✅ **Idempotency**: `ON CONFLICT (referral_id) DO NOTHING` prevents duplicate awards
- ✅ **Early exit**: Returns empty if milestone already exists (`v_milestone_id IS NULL`)
- ✅ **Units**: All parameters and return values in cents (BIGINT)

#### Operations Performed
1. ✅ Inserts milestone record into `referral_milestones` (with conflict handling)
2. ✅ Calculates referrer balance from `referral_earnings_ledger`
3. ✅ Inserts EARNED event into `referral_earnings_ledger` with balance
4. ✅ Updates `referrals` table: sets `status = 'milestone_reached'`, `milestone_reached_at = NOW()`
5. ✅ Returns milestone metadata (id, referrer_id, referral_id, guard_id, reward, balance)

#### Schema Compliance
- ✅ Uses existing `referral_milestones` table (created in migration `0025`)
- ✅ Unique constraint `idx_referral_milestones_unique_referral` ensures one milestone per referral
- ✅ Foreign keys reference `referrals`, `referrers`, `guards` (proper relationships)
- ✅ No plain MSISDN/PII stored or logged

#### RLS & Security
- ✅ RPC runs under service role context (expected for admin operations)
- ✅ No RLS bypasses — function respects existing table policies
- ✅ No secrets or PII in function body

**Conclusion**: RPC design is sound, idempotent, and Ledger-compliant.

---

## 4. Application Logic Review

### ✅ `src/lib/referrals.ts`

#### Config Parsing
- ✅ Reads `REFERRAL_TIP_THRESHOLD_ZAR` / `REFERRAL_FEE_PER_GUARD_ZAR` from env
- ✅ Supports fallback env vars (`REFERRAL_MILESTONE_THRESHOLD_ZAR`, `REFERRAL_MILESTONE_REWARD_ZAR`)
- ✅ Defaults: 50000 cents (R500), 2000 cents (R20) — **matches Ledger §3**
- ✅ `parseZarToCents()` correctly handles integer and decimal strings

#### Eligibility Filtering
- ✅ `determineEligibleReferralMilestones()` correctly:
  - Filters guards with `lifetime_gross_tips >= thresholdZarCents`
  - Excludes referrals with `milestone_reached_at IS NOT NULL`
  - Excludes referrals with existing milestone status
- ✅ Prevents multiple rewards for same guard/referrer pair

#### RPC Integration
- ✅ Uses `supabase.rpc('award_referral_milestone', ...)` — **no raw SQL bypass**
- ✅ Passes correct parameters (referral_id, referrer_id, guard_id, lifetime_gross, threshold, reward)
- ✅ Handles RPC errors with descriptive messages
- ✅ Aggregates results into summary structure

#### Logging
- ✅ No MSISDN/PII logged — only internal IDs (referral_id, guard_id, referrer_id)
- ✅ Error messages use safe identifiers only

### ✅ `src/api/routes/admin.ts`

#### Integration Point
- ✅ Milestone processing invoked **before** payout generation (line 54)
- ✅ Aligned with Ledger §9 (weekly payouts) and §10.2 (milestone automation)

#### Auth & Authorization
- ✅ `requireAuth` + `requireRole('admin')` enforced — **admin-only endpoint**
- ✅ No role bypasses

#### Response Payload
- ✅ `referral_milestones_summary` included in response (line 351)
- ✅ Contains: `config`, `totalCandidates`, `milestonesAwarded`, `totalRewardAmountZarCents`, `rewards[]`
- ✅ No PII exposed — only internal IDs and aggregates

#### Logging
- ✅ `console.info` used for milestone summary (line 56) — **acceptable per §13.6** (structured logging with non-PII data)
- ✅ Error logging uses safe identifiers only
- ✅ No raw phone numbers or secrets

**Conclusion**: Application logic is correct, secure, and Ledger-compliant.

---

## 5. Tests & Mocks

### ✅ Test Coverage

#### `tests/lib/referrals.test.ts`
- ✅ **Progression scenario**: < R500 → no reward, crossing R500 → one reward, subsequent > R500 → no second reward
- ✅ **Edge case**: Jump from R0 to >= R500 (single payout)
- ✅ Tests use correct threshold (50000 cents) and verify idempotency

#### `tests/api/admin-payouts.test.ts`
- ✅ **RPC call verification**: Tests confirm `supabase.rpc('award_referral_milestone', ...)` is called with expected arguments
- ✅ **Integration test**: Verifies milestone processing runs during payout generation
- ✅ **Response validation**: Confirms `referral_milestones_summary` in response payload

#### Supabase Mock Updates
- ✅ All test files updated to include `.rpc` mock:
  - `tests/api/auth.test.ts`
  - `tests/api/guards.test.ts`
  - `tests/api/payments.test.ts`
  - `tests/api/qr-reassign.test.ts`
  - `tests/api/referrers-earnings-summary.test.ts`
- ✅ Mocks do not leak secrets or PII

### ✅ Test Execution

```bash
Test Files  10 passed (10)
Tests  83 passed (83)
Duration  2.04s
```

- ✅ All tests pass
- ✅ Build succeeds (`npm run build` exits with code 0)
- ✅ No test brittleness observed

**Conclusion**: Comprehensive test coverage with all tests passing.

---

## 6. Security, POPIA & RLS

### ✅ Security & POPIA

#### MSISDN / PII Handling
- ✅ **No MSISDN logged** — grep confirms no phone number references in `src/lib/referrals.ts` or `src/api/routes/admin.ts`
- ✅ **No PII in responses** — `referral_milestones_summary` contains only internal IDs (UUIDs) and aggregates
- ✅ **No PII in logs** — milestone logging uses guard/referral IDs only

#### Secrets
- ✅ **No secrets added** — no API keys, tokens, or credentials in source or tests
- ✅ **Env-driven config** — all sensitive values read from environment variables

### ✅ RLS & Auth

#### Admin Endpoint
- ✅ `POST /admin/payouts/generate-weekly` requires `requireRole('admin')` — **admin-only access**
- ✅ No role bypasses or privilege escalations

#### RPC Usage
- ✅ RPC runs under service role context (expected for admin operations)
- ✅ Does not introduce public bypasses
- ✅ Respects existing RLS policies on underlying tables

#### Referrer Data Scoping
- ✅ Referral milestone summary is admin-only (not exposed to referrers in this PR)
- ✅ Future referrer-facing endpoints would need proper RLS scoping (out of scope for this PR)

**Conclusion**: Security, POPIA, and RLS requirements met.

---

## Issues / Recommendations

### 🔴 Blocking Issues

**None** — No blocking issues found.

---

### 🟡 Non-Blocking Suggestions

1. **Test Cleanup** (Minor)
   - **Finding**: One duplicate test case was removed from `tests/api/referrers-earnings-summary.test.ts` (test for guard role returning 403, which was already covered elsewhere).
   - **Impact**: None — test coverage remains comprehensive.
   - **Recommendation**: No action required. This is a cleanup improvement.

2. **Logging Format** (Minor)
   - **Finding**: `console.info` is used for milestone summary logging (line 56 in `admin.ts`). Per §13.6, structured logging is preferred but `console.*` is acceptable for non-sensitive data.
   - **Impact**: None — current logging is POPIA-compliant and does not expose PII.
   - **Recommendation**: Consider migrating to structured logger in future phase (not required for this PR).

3. **Env Var Naming** (Informational)
   - **Finding**: Code supports both `REFERRAL_TIP_THRESHOLD_ZAR` (Ledger §3) and `REFERRAL_MILESTONE_THRESHOLD_ZAR` (fallback). This provides flexibility but may cause confusion.
   - **Impact**: None — defaults are correct and Ledger-compliant.
   - **Recommendation**: Document preferred env var names in code comments or README (optional).

---

## Governance Note

### ✅ Compliance Confirmation

- ✅ **Tippy Decision Ledger v1.0 compliance**: Implementation follows §3 (Config), §4 (Data Model), §6.5 (Referrals), §9 (Payouts), §10 (Referrals Domain), §13.6 (Logging Policy).
- ✅ **No Ledger modifications**: `docs/TIPPY_DECISION_LEDGER.md` unchanged.
- ✅ **No plaintext secrets / PII**: All sensitive data handled via env vars and masked/hashed where required.
- ✅ **P2 Enhancement**: This is a P2 (Important, not blocking) enhancement ready for human approval and merge.

### ✅ Ready for Merge

This PR is **ready for merge** once any non-blocking suggestions (if desired) are addressed. All blocking requirements are satisfied.

---

**Review Completed**: 2025-11-20  
**Reviewer**: Tippy Governance Review Agent  
**Status**: ✅ **PASS WITH NITS**
