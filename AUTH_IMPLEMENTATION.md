# Authentication, Roles & RLS Implementation (P1.6)

**Branch**: `feat/auth-and-rls`  
**Ledger References**: §2 (Roles & Access), §8 (RLS / Security), §13 (POPIA & Security)  
**Date**: 2025-01-27

---

## Summary

This implementation adds Supabase Auth JWT-based authentication, role-based access control, and Row Level Security (RLS) policies to the Tippy backend.

### What Changed

1. **Auth Middleware** — JWT verification and role-based access control
2. **RLS Policies** — Database-level security policies for all core tables
3. **Route Protection** — Endpoints protected by role requirements
4. **Identity Extraction** — User identity from JWT tokens, not request params

---

## Authentication Model

### JWT Token Structure

Supabase Auth JWTs contain:
- `sub` — User ID (maps to `users.id` in database)
- `role` — Optional role claim (falls back to `users.role` lookup)
- Standard JWT claims (`iat`, `exp`, `iss`, `aud`)

### Token Verification

**Environment Variables**:
- `SUPABASE_JWT_SECRET` — JWT signing secret (required)
- `SUPABASE_JWT_ISSUER` — Optional JWT issuer validation
- `SUPABASE_JWT_AUDIENCE` — Optional JWT audience validation

**Process**:
1. Extract token from `Authorization: Bearer <token>` header
2. Verify JWT signature using `SUPABASE_JWT_SECRET`
3. Extract `userId` from `sub` claim
4. Look up `role` from `users.role` column (or use JWT claim if present)
5. Attach `req.auth = { userId, role }` to Express request

---

## Roles

Per Ledger §2:

| Role | Access |
|------|--------|
| **admin** | Full system access, all endpoints |
| **referrer** | Own referrals, earnings, can register guards |
| **guard** | Own profile, QR codes, payments |
| **internal** | Internal system operations |

---

## Route Protection

### Public Endpoints (No Auth Required)

- `POST /payments/create` — Public tipping endpoint
- `POST /payments/webhook` — Yoco webhook (signature verified separately)
- `GET /health` — Health check

### Guard Endpoints

**Middleware**: `requireAuth` + `requireRole('guard')`

- `GET /guards/me` — Get own profile
- `POST /qr/reassign` — Reassign own QR code

**Identity**: `req.auth.userId` → `guards.id`

### Referrer Endpoints

**Middleware**: `requireAuth` + `requireRole('referrer')`

- `POST /referrals/create` — Create referral
- `GET /referrers/earnings/summary` — Get own earnings
- `GET /referrers/referrals` — List own referrals
- `POST /guards/register` — Register guard (when invoked by referrer)

**Identity**: `req.auth.userId` → `referrers.id`

### Admin Endpoints

**Middleware**: `requireAuth` + `requireRole('admin')`

- `POST /admin/qr/assign` — Assign QR to guard
- `POST /admin/qr/bulk-generate` — Generate QR batch
- `POST /admin/payouts/generate` — Generate payout batch
- `POST /admin/settings/set` — Update app settings
- `POST /admin/referral/reversal` — Reverse referral (future)
- `POST /admin/qr/export` — Export QR codes (future)

**Identity**: `req.auth.userId` → Admin user ID

### Guard Registration

**Middleware**: `requireAuth` + `requireRole('admin', 'referrer')`

- `POST /guards/register` — Register new guard

**Behavior**:
- If invoked by **referrer**: `referrer_id` derived from `req.auth.userId` (body param ignored)
- If invoked by **admin**: Admin may optionally supply `referrer_id` in body to attribute guard

---

## Row Level Security (RLS)

### Enabled Tables

RLS enabled on:
- `guards`
- `referrers`
- `referrals`
- `referral_earnings_ledger`
- `payments`
- `payout_batches`
- `payout_batch_items`
- `qr_codes`
- `users`
- `audit_log`
- `sms_events`

### Policy Examples

**Guards**:
```sql
-- Guards can only see their own record
CREATE POLICY "guard_select_self"
ON guards FOR SELECT
USING (id = auth.uid());
```

**Referrals**:
```sql
-- Referrers can only see their own referrals
CREATE POLICY "referrer_select_own_referrals"
ON referrals FOR SELECT
USING (
  referrer_id IN (
    SELECT id FROM referrers WHERE id = auth.uid()
  )
);
```

**Admin Access**:
```sql
-- Admins can see all records
CREATE POLICY "admin_select_all_guards"
ON guards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);
```

### Service Role Bypass

For admin operations that must bypass RLS:
- Use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_ANON_KEY`
- Service role connections bypass all RLS policies
- Only used for backend admin operations per Ledger §25

---

## Migration

**File**: `infra/db/migrations/0019_rls_policies.sql`

**To Apply**:
```bash
npm run build
npm run migrate
```

**What It Does**:
1. Enables RLS on all core tables
2. Creates policies for guards, referrers, admins
3. Ensures users can only access their own data
4. Allows admins full access via role check

---

## Usage Examples

### Protecting a Route

```typescript
import { requireAuth, requireRole } from '../../lib/auth';

router.get(
  '/me',
  requireAuth,           // Verify JWT
  requireRole('guard'),  // Require guard role
  async (req, res) => {
    // req.auth is guaranteed to exist
    const userId = req.auth!.userId;
    const role = req.auth!.role;
    
    // Query automatically scoped by RLS
    const { data } = await supabase
      .from('guards')
      .select('*')
      .eq('id', userId)
      .single();
    
    res.json(data);
  }
);
```

### Multiple Roles

```typescript
router.post(
  '/register',
  requireAuth,
  requireRole('admin', 'referrer'), // Either admin OR referrer
  async (req, res) => {
    // ...
  }
);
```

### Optional Auth

```typescript
import { optionalAuth } from '../../lib/auth';

router.get(
  '/public-data',
  optionalAuth, // Auth if present, but not required
  async (req, res) => {
    if (req.auth) {
      // User is authenticated
    } else {
      // Anonymous user
    }
  }
);
```

---

## Error Responses

### 401 AUTHZ_DENIED

**When**: Missing or invalid JWT token

```json
{
  "error": "AUTHZ_DENIED",
  "message": "Authorization header missing"
}
```

### 403 AUTHZ_DENIED

**When**: Valid token but insufficient role

```json
{
  "error": "AUTHZ_DENIED",
  "message": "Access denied. Required role: admin"
}
```

---

## Testing

### Generate Test Tokens

```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    sub: 'user-123',
    role: 'guard',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  process.env.SUPABASE_JWT_SECRET!
);
```

### Test Scenarios

1. **Unauthenticated**: No `Authorization` header → 401
2. **Invalid Token**: Wrong secret or expired → 401
3. **Wrong Role**: Guard accessing admin endpoint → 403
4. **Correct Role**: Guard accessing guard endpoint → 200
5. **RLS Enforcement**: Guard querying another guard's data → 0 rows (RLS blocks)

---

## Environment Variables

Add to `.env` or Doppler:

```bash
# JWT Configuration
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1  # Optional
SUPABASE_JWT_AUDIENCE=authenticated  # Optional

# Supabase Keys
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key  # For user queries (respects RLS)
SUPABASE_SERVICE_ROLE_KEY=your-service-key  # For admin ops (bypasses RLS)
```

---

## Breaking Changes

⚠️ **All protected endpoints now require JWT authentication**

**Before**:
```typescript
// Endpoints accepted user_id in body/query
POST /guards/me?guard_id=xxx
```

**After**:
```typescript
// Endpoints extract user_id from JWT
GET /guards/me
Authorization: Bearer <jwt-token>
// req.auth.userId is used automatically
```

**Migration Path**:
1. Update clients to include `Authorization: Bearer <token>` header
2. Remove `user_id`/`admin_user_id` from request bodies/queries
3. Ensure users table has correct `role` values

---

## Compliance

✅ **Ledger §2** — Roles: admin, referrer, guard, internal  
✅ **Ledger §8** — RLS: Guards read self, Referrers read own referrals/earnings, Admin full access  
✅ **Ledger §12** — Error taxonomy: AUTHZ_DENIED for auth failures  
✅ **Ledger §13** — POPIA: No tokens/secrets logged  
✅ **Ledger §25** — Service role key for admin operations

---

## Next Steps

1. **Update Existing Routes**: Apply auth middleware to P1.2/P1.3 endpoints when merged
2. **Client Integration**: Update frontend to include JWT tokens in requests
3. **User Management**: Ensure users table is populated with correct roles
4. **Token Refresh**: Implement token refresh flow (if needed)

---

**Created**: 2025-01-27  
**Status**: Ready for Review

