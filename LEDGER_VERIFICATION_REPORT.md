# Ledger Verification Report — Supabase + SendGrid Stack Lock

**Date**: 2025-11-17  
**Repository**: francoisvandijk/tippy  
**Branch**: main  
**Ledger File**: docs/TIPPY_DECISION_LEDGER.md  
**Verification Agent**: Tippy Ledger Verification Agent

---

## 1. Status Summary

✅ **PASSED** — Supabase + SendGrid stack lock-in correctly reflected in Ledger on main.

All required locked sections are present, correctly worded, and properly marked. The Ledger clearly establishes Supabase Postgres as the system-of-record database, Supabase Auth as the canonical identity provider, and SendGrid as the primary messaging provider.

---

## 2. Checklist Results

### A) Supabase Postgres — System of Record

**Status**: ✅ **PASS**

**Location**: §4.1 — Primary Data Platform — Supabase (Locked) (lines 225-248)

**Verification**:
- ✅ Subsection exists under §4 with title "Primary Data Platform — Supabase (Locked)"
- ✅ Clearly marked as **(Locked)** at line 248
- ✅ States: "The authoritative operational database for Tippy is Supabase Postgres" (line 232)
- ✅ Declares: "Any future data stores (analytics, caching, warehousing) must treat Supabase Postgres as the system-of-record" (line 240)
- ✅ Lists all core entities: "guards, referrers, payments, referrals, payouts, sms_events, audit_log, etc." (line 236)
- ✅ Explicitly calls out: "Supabase's Row-Level Security (RLS) engine is the canonical enforcement mechanism for per-role and per-user data access as defined in §2 and §8" (line 238)
- ✅ No contradictory text found

**Key Quote**:
> "The authoritative operational database for Tippy is Supabase Postgres."

---

### B) Supabase Auth — Canonical Identity Provider

**Status**: ✅ **PASS**

**Location**: §8.1 — Authentication Provider — Supabase Auth (Locked) (lines 364-389)

**Verification**:
- ✅ Subsection exists under §8 with title "Authentication Provider — Supabase Auth (Locked)"
- ✅ Clearly marked as **(Locked)** at line 389
- ✅ States: "All end-user and referrer authentication is provided by Supabase Auth" (line 371)
- ✅ Explicitly mentions: "Tippy trusts only Supabase-issued JWTs signed with the configured `SUPABASE_JWT_SECRET`" (line 375)
- ✅ Declares: "The `auth.uid()` value from Supabase is mapped to `users.id` in the Tippy schema and is the basis for RLS policies" (line 377)
- ✅ Mentions role resolution: "Roles (admin, referrer, guard, internal) are resolved from the `users` table and/or JWT claims exactly as implemented in P1.6" (line 379)
- ✅ Mandates federation: "Any alternative identity providers must federate into Supabase Auth rather than bypassing it" (line 381)
- ✅ No contradictory text found

**Key Quote**:
> "All end-user and referrer authentication is provided by Supabase Auth."

---

### C) SendGrid — Primary Messaging Provider

**Status**: ✅ **PASS**

**Location**: §25.2 — Official Messaging Provider — SendGrid (Locked) (lines 1395-1425)

**Verification**:
- ✅ Subsection exists under §25 with title "Official Messaging Provider — SendGrid (Locked)"
- ✅ Clearly marked as **(Locked)** at line 1425
- ✅ States: "SendGrid is the single, primary provider for all transactional messaging in Tippy" (line 1402)
- ✅ Explicitly covers: "Welcome SMS to guards per §24.3" and "All transactional email communication configured for Tippy" (lines 1407-1408)
- ✅ Lists all required env vars:
  - `SENDGRID_API_KEY` (required) (line 1411)
  - `SENDGRID_FROM_PHONE` (for SMS, where applicable) (line 1412)
  - `SENDGRID_FROM_EMAIL` (for email, where applicable) (line 1413)
  - `WELCOME_SMS_TEMPLATE_ID = tippy_guard_welcome_v1` (per §24.3) (line 1414)
- ✅ Establishes provider hierarchy: "Twilio or other providers may be used only as explicit secondary/fallback providers via future Ledger amendments" (line 1416)
- ✅ Maintains logging requirement: "All SMS events must still be logged to `sms_events` per §24.3 with `msisdn_hash` and masked MSISDN, regardless of provider" (line 1418)

**§24.3 Update Verification**:
- ✅ §24.3 has been updated to reference SendGrid: "Welcome SMS is sent via SendGrid (or approved fallback provider, currently SendGrid as primary) per §25.2" (line 1038)
- ✅ Policy meaning preserved — no semantic changes to the Welcome SMS policy itself

**Key Quote**:
> "SendGrid is the single, primary provider for all transactional messaging in Tippy."

---

### D) Environment & Secrets — Supabase + SendGrid Vars Present

**Status**: ✅ **PASS**

**Location**: §25.3 — Environment Variables (Names Only) (lines 1205-1251)

**Supabase Variables** (lines 1212-1218):
- ✅ `SUPABASE_URL` (authoritative config for API endpoint)
- ✅ `SUPABASE_ANON_KEY` (authoritative config for client-side access)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (authoritative config for server-side operations)
- ✅ `SUPABASE_DB_URL` (authoritative config for direct Postgres connection)
- ✅ `SUPABASE_JWT_SECRET` (authoritative config for JWT signature verification)

**SendGrid Variables** (lines 1226-1230):
- ✅ `SENDGRID_API_KEY` (authoritative config for messaging operations)
- ✅ `SENDGRID_FROM_PHONE` (for SMS, where applicable)
- ✅ `SENDGRID_FROM_EMAIL` (for email, where applicable)
- ✅ `WELCOME_SMS_TEMPLATE_ID` (referenced in §25.2 at line 1414)

**Security Verification**:
- ✅ No actual secrets, sample keys, or real-looking values present
- ✅ Only variable names and descriptions are listed
- ✅ All variables clearly marked with their purpose/authority

---

## 3. Detected Issues

**None.** All required elements are present and correctly implemented.

---

## 4. Recommended Fixes

**None required.** The Ledger correctly reflects the Supabase + SendGrid stack lock-in.

---

## 5. Git History Verification

**Commit**: `42ee1d8` — "Ledger Update — Lock Supabase & SendGrid as Official Stack (Locked) (#16)"

**Files Changed**:
- `docs/TIPPY_DECISION_LEDGER.md` — Ledger updates (108 insertions, 5 deletions)
- Additional implementation files (auth, migrations, tests) — These align with the Ledger and are expected

**Note**: The PR #16 included both Ledger changes and related implementation files. This is acceptable as the implementation aligns with the Ledger governance decisions. The Ledger changes themselves are isolated to the governance document.

---

## 6. Confirmation for Governance

**Conclusion**: Supabase Postgres is clearly locked as the system-of-record database (§4.1), Supabase Auth is locked as the sole identity provider (§8.1), and SendGrid is locked as the primary messaging provider (§25.2) in the Ledger on main. All three declarations are immutable, properly marked as (Locked), and include all required technical specifications and environment variable references.

The Ledger correctly establishes the Supabase + SendGrid stack as the official, locked platform for Tippy. All future engineering work must treat these as the authoritative providers, with any deviations requiring a Ledger amendment process.

---

**Verification Status**: ✅ **COMPLETE — ALL CHECKS PASSED**

**Ledger = Law. Verification complete.**




