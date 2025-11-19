## Summary

This PR implements P1.3 features: Guard Registration, Welcome SMS, Referrals & Payouts per Tippy Decision Ledger v1.0 (Final).

## Changes

### 1. Guard Registration Flow (Admin + Referrer)
- **POST /guards/register**: Implemented with admin and referrer role support
- Anti-abuse limits enforced per Ledger §24.4.5:
  - GUARD_REGS_PER_REFERRER_PER_DAY (default: 15)
  - GUARD_REGS_PER_DEVICE_PER_DAY (default: 20)
  - GUARD_REGS_PER_IP_PER_HOUR (default: 30)
- MSISDN hashing per POPIA compliance (§13, §25)
- QR card assignment validation (must be UNASSIGNED)
- Guard registration events logged

### 2. Welcome SMS Flow (per §24.3)
- **sendWelcomeSms()** function implemented in `src/lib/sms.ts`
- Triggers automatically on successful guard registration
- Respects SEND_GUARD_WELCOME_SMS config flag
- Uses template tippy_guard_welcome_v1
- SMS events logged to sms_events table (no raw MSISDN)
- Non-blocking: registration succeeds even if SMS fails

### 3. Referrals Flow
- Referral records created when guard registered via referrer
- **GET /referrers/me/guards**: Returns referred guards (no PII)
- Links guards to referrers correctly
- POPIA-compliant: uses msisdn_hash, no raw MSISDN

### 4. Payouts Flow
- **POST /admin/payouts/generate-weekly**: Admin endpoint for payout generation
- Calculates weekly payouts (Sat 00:00 → Fri 23:59)
- Applies fees: Yoco fee, platform fee, VAT, CashSend fee
- Creates payout_batches and payout_batch_items
- CSV generation (compatible with bank CashSend format)
- **GET /guards/me/earnings**: Guard earnings summary
- **GET /guards/me/payouts**: Paginated payout history

## Files Changed

- `src/api/routes/guards.ts`: Guard registration, earnings, payouts endpoints
- `src/api/routes/admin.ts`: Payout generation endpoint
- `src/api/routes/referrers.ts`: Referrer guard list endpoint
- `src/server.ts`: Route registration
- `tests/api/guards.test.ts`: Comprehensive test coverage

## Ledger Sections Implemented

- §24.3 — Welcome SMS Policy (Locked)
- §24.4 — Referrer Activation & Guard Registration via Referrer (Locked)
- §9 — Payouts (Weekly)
- §10 — Referrals (Locked)
- §13 — POPIA & Security
- §2 — Roles & Access
- §8 — RLS / Security

## Test Results

All tests pass:
```
Test Files  5 passed (5)
Tests  45 passed (45)
```

## POPIA/MSISDN Compliance

✅ All MSISDN values hashed using SHA256 before storage
✅ No raw MSISDN in responses or logs
✅ Masked MSISDN format (xxxxxx1234) used in logs
✅ SMS events use msisdn_hash and msisdn_masked fields

## Assumptions / TODOs

- Email CSV to admin (Tier-3 automation) - currently returns CSV in response
- SMS provider configuration via env vars (SendGrid primary, Twilio fallback)
- Payout batch email requires SendGrid email integration (future enhancement)

## Governance

- No locked Ledger sections modified
- All changes in `src/**` and `tests/**` only
- No secrets or PII in code or logs
- All audit events logged per Ledger requirements



