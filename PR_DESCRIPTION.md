# feat: Implement Core API Endpoints per Ledger §7 (P1.2)

## Summary

This PR implements **P1.2 (Core API Endpoints)** from the Full-Stack Readiness Audit (2025-01-27), implementing all required API endpoints per Ledger §7.

### What Changed

1. **Guard & QR Endpoints** — Implemented guard profile and QR reassignment
2. **Referral Endpoints** — Implemented referral creation and referrer earnings/referrals listing
3. **Admin Endpoints** — Implemented QR assignment, payout batch creation, settings management, and bulk QR generation
4. **Utility Functions** — Added phone hashing/masking and audit logging helpers
5. **Tests** — Added basic validation and request-shape tests for all new endpoints

## Endpoints Implemented

### Guard Endpoints (Ledger §7)

| Endpoint | Method | Purpose | Tables Used |
|----------|--------|---------|-------------|
| `/guards/me` | GET | Get guard profile and earnings summary | `guards`, `qr_codes`, `payments` |
| `/qr/reassign` | POST | Guard reassigns to a new QR code | `guards`, `qr_codes`, `audit_log` |

### Referral Endpoints (Ledger §7)

| Endpoint | Method | Purpose | Tables Used |
|----------|--------|---------|-------------|
| `/referrals/create` | POST | Create referral record | `referrers`, `guards`, `referrals`, `audit_log` |
| `/referrers/earnings/summary` | GET | Get referrer earnings summary | `referrers`, `referral_balances` (view), `referral_earnings_ledger` |
| `/referrers/referrals` | GET | List referred guards | `referrals`, `guards` |

### Admin Endpoints (Ledger §7)

| Endpoint | Method | Purpose | Tables Used |
|----------|--------|---------|-------------|
| `/admin/qr/assign` | POST | Admin assigns QR to guard | `guards`, `qr_codes`, `audit_log` |
| `/admin/qr/bulk-generate` | POST | Create batch of QR codes | `qr_batches`, `qr_codes`, `qr_designs`, `audit_log` |
| `/admin/payouts/generate` | POST | Create payout batch (skeleton) | `payout_batches`, `audit_log` |
| `/admin/settings/set` | POST | Update app setting | `app_settings`, `audit_log` |

**Total**: 9 new endpoints (12/12 required endpoints now implemented including existing payments endpoints)

## Key Features

### POPIA Compliance (§13)
- Phone numbers are hashed using SHA256 for storage
- Phone numbers are masked (xxxxxx1234) in logs and responses
- No raw MSISDN logged in audit trails

### Error Taxonomy (§12)
All endpoints use proper error codes:
- `VALIDATION_ERROR` — Invalid input data
- `PROCESSOR_ERROR` — Database or processing errors
- `AUTHZ_DENIED` — Reserved for future auth implementation (P1.6)

### Audit Logging (§25)
All write operations log to `audit_log` table with:
- Event type and category
- Actor information (user_id, role, IP)
- Entity information (type, id)
- Action and description
- Status and changes

### Validation
All endpoints use Zod schemas for request validation:
- UUID format validation
- Required field checks
- Type validation (string, number, boolean, JSON)
- Business rule validation (e.g., duplicate MSISDN lockout)

## Database Tables Used

| Table | Endpoints Using It |
|-------|-------------------|
| `guards` | `/guards/me`, `/qr/reassign`, `/referrals/create`, `/admin/qr/assign` |
| `qr_codes` | `/qr/reassign`, `/guards/me`, `/admin/qr/assign`, `/admin/qr/bulk-generate` |
| `referrers` | `/referrals/create`, `/referrers/earnings/summary`, `/referrers/referrals` |
| `referrals` | `/referrals/create`, `/referrers/referrals` |
| `referral_balances` (view) | `/referrers/earnings/summary` |
| `referral_earnings_ledger` | `/referrers/earnings/summary` |
| `payout_batches` | `/admin/payouts/generate` |
| `app_settings` | `/admin/settings/set` |
| `qr_batches` | `/admin/qr/bulk-generate` |
| `qr_designs` | `/admin/qr/bulk-generate` |
| `audit_log` | All write endpoints |
| `payments` | `/guards/me` (existing endpoint) |

## TODOs Deferred to Future PRs

### P1.3 — SMS Integration
- Welcome SMS sending on guard registration
- SMS event logging to `sms_events` table
- Retry logic (3 attempts per §24.3)

### P1.4 — Referral Business Logic
- R500 milestone trigger and R20 reward (per §10.2)
- T+30 reversal logic for chargebacks
- Automatic `referral_earnings_ledger` entries
- Full milestone tracking

### P1.5 — Payout System
- Payout batch item computation from payments and referral earnings
- CashSend integration
- CSV export generation
- Auto-email functionality (Tier-3)

### P1.6 — Authentication & Authorization
- JWT or Supabase Auth integration
- Role-based access control (Admin, Guard, Referrer, User)
- RLS policies per Ledger §8
- Extract user_id from auth tokens (currently accepts as query/body params)

## How to Test

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Run Server Locally
```bash
npm run dev
```

### Example API Calls

#### Get Guard Profile
```bash
curl http://localhost:3000/guards/me?guard_id=<guard-uuid>
```

#### Reassign QR Code
```bash
curl -X POST http://localhost:3000/qr/reassign \
  -H "Content-Type: application/json" \
  -d '{
    "guard_id": "<guard-uuid>",
    "qr_code_id": "<qr-code-uuid>"
  }'
```

#### Create Referral
```bash
curl -X POST http://localhost:3000/referrals/create \
  -H "Content-Type: application/json" \
  -d '{
    "referrer_id": "<referrer-uuid>",
    "guard_msisdn": "+27123456789"
  }'
```

#### Get Referrer Earnings
```bash
curl http://localhost:3000/referrers/earnings/summary?referrer_id=<referrer-uuid>
```

#### Admin: Assign QR
```bash
curl -X POST http://localhost:3000/admin/qr/assign \
  -H "Content-Type: application/json" \
  -d '{
    "admin_user_id": "<admin-uuid>",
    "qr_code_id": "<qr-code-uuid>",
    "guard_id": "<guard-uuid>"
  }'
```

#### Admin: Generate Payout Batch
```bash
curl -X POST http://localhost:3000/admin/payouts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "admin_user_id": "<admin-uuid>",
    "period_start_date": "2025-01-18",
    "period_end_date": "2025-01-24"
  }'
```

#### Admin: Update Setting
```bash
curl -X POST http://localhost:3000/admin/settings/set \
  -H "Content-Type: application/json" \
  -d '{
    "admin_user_id": "<admin-uuid>",
    "key": "PLATFORM_FEE_PERCENT",
    "value": "12.00",
    "value_type": "number"
  }'
```

## Compliance

✅ **Ledger §7** — All 12 required endpoints implemented  
✅ **Ledger §12** — Error taxonomy (VALIDATION_ERROR, PROCESSOR_ERROR)  
✅ **Ledger §13** — POPIA compliance (phone masking, no PII logging)  
✅ **Ledger §25** — Audit logging for all write operations  
✅ **Full-Stack Audit P1.2** — Core API endpoints complete  

## Breaking Changes

⚠️ **None** — All new endpoints. Existing payment endpoints remain unchanged.

## Dependencies Added

- `uuid` (^9.0.1) — For generating QR code IDs
- `@types/uuid` (^9.0.7) — TypeScript types

## References

- **Full-Stack Readiness Audit**: `docs/FULL_STACK_READINESS_AUDIT.md` (2025-01-27) — P1.2
- **Ledger**: `docs/TIPPY_DECISION_LEDGER.md` v1.0 (Final) — §7 (API Surface)
- **Previous PR**: Core Database Schema (P1.1) — All tables now available for use

---

**Created**: 2025-01-27  
**Branch**: `feat/api-endpoints-ledger-7`  
**Target**: `main`  
**Status**: Ready for Review

