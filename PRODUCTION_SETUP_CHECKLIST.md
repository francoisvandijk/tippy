# P1.3 Production Setup Checklist

**Date**: 2025-11-17  
**Status**: Ready for Production Deployment

---

## Step 1: Set Environment Variables in Doppler (Production)

### Prerequisites
- [ ] Doppler CLI installed (`doppler --version`)
- [ ] Authenticated with Doppler (`doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>`)
- [ ] Project `tippy` exists
- [ ] Environment `production` exists

### Run Verification Script
```powershell
.\scripts\verify-production-setup.ps1 -Environment production
```

### Required Variables to Set

#### Database (Supabase)
- [ ] `SUPABASE_URL` - Supabase API endpoint
- [ ] `SUPABASE_ANON_KEY` - Supabase anonymous key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `SUPABASE_DB_URL` - Direct Postgres connection string
- [ ] `SUPABASE_JWT_SECRET` - JWT signature verification secret

#### Payment Processing (Yoco)
- [ ] `YOCO_LIVE_PUBLIC_KEY` - Yoco live public API key (format: `pk_live_...`) - Production only
- [ ] `YOCO_LIVE_SECRET_KEY` - Yoco live secret API key (format: `sk_live_...`) - Production only
- [ ] `YOCO_TEST_PUBLIC_KEY` - Yoco test public API key (format: `pk_test_...`) - Dev/Test environments
- [ ] `YOCO_TEST_SECRET_KEY` - Yoco test secret API key (format: `sk_test_...`) - Dev/Test environments
- [ ] `YOCO_WEBHOOK_SECRET` - Yoco webhook signature secret

#### SMS (SendGrid - Primary)
- [ ] `SENDGRID_API_KEY` - SendGrid API key
- [ ] `SENDGRID_FROM_PHONE` - SendGrid phone number for SMS
- [ ] `SENDGRID_FROM_EMAIL` - SendGrid email address

#### SMS (Twilio - Fallback, Optional)
- [ ] `TWILIO_ACCOUNT_SID` - Twilio account SID
- [ ] `TWILIO_AUTH_TOKEN` - Twilio auth token
- [ ] `TWILIO_PHONE_NUMBER` - Twilio phone number

#### Configuration Flags
- [ ] `SEND_GUARD_WELCOME_SMS` - Enable welcome SMS (default: `true`)
- [ ] `WELCOME_SMS_TEMPLATE_ID` - SMS template ID (default: `tippy_guard_welcome_v1`)
- [ ] `WELCOME_SMS_SENDER_ID` - SMS sender ID
- [ ] `WELCOME_SMS_RETRY_COUNT` - SMS retry attempts (default: `3`)
- [ ] `GUARD_REGS_PER_REFERRER_PER_DAY` - Anti-abuse limit (default: `15`)
- [ ] `GUARD_REGS_PER_DEVICE_PER_DAY` - Anti-abuse limit (default: `20`)
- [ ] `GUARD_REGS_PER_IP_PER_HOUR` - Anti-abuse limit (default: `30`)
- [ ] `PAYOUT_MIN_ELIGIBILITY_ZAR` - Minimum payout in cents (default: `50000` = R500)
- [ ] `CASH_SEND_FEE_ZAR` - CashSend fee in cents (default: `900` = R9.00)

### Setting Variables in Doppler
```powershell
# Example: Set a variable
doppler secrets set VARIABLE_NAME="value" --project tippy --config production

# Verify all variables are set
doppler secrets get --project tippy --config production --only-names
```

---

## Step 2: Verify Database Migrations Applied

### Run Verification Script
```powershell
.\scripts\verify-database-migrations.ps1 -Environment production
```

### Manual Verification

1. **Connect to Database**
   ```sql
   -- Use SUPABASE_DB_URL from Doppler
   psql $SUPABASE_DB_URL
   ```

2. **Check Required Tables**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN (
     'users',
     'guards',
     'qr_codes',
     'referrers',
     'referrals',
     'payout_batches',
     'payout_batch_items',
     'sms_events',
     'guard_registration_events'
   );
   ```

3. **Verify Migration Files**
   - Location: `infra/db/migrations/`
   - Key migrations for P1.3:
     - `0020_users.sql`
     - `0021_guards.sql`
     - `0022_qr_codes.sql`
     - `0023_referrers.sql`
     - `0024_referrals.sql`
     - `0028_payout_batches.sql`
     - `0029_payout_batch_items.sql`
     - `0031_sms_events.sql`
     - `0035_guard_registration_events.sql`

4. **Apply Missing Migrations** (if any)
   ```bash
   # Manually execute migration SQL files against database
   # Or use migration runner if configured
   npm run migrate:up
   ```

---

## Step 3: Test SendGrid SMS Integration

### Run Test Script
```powershell
.\scripts\test-sendgrid-sms.ps1 -TestPhone "+27721234567" -Environment production
```

### Manual Verification

1. **Check SendGrid Dashboard**
   - [ ] API key is active
   - [ ] SMS API is enabled
   - [ ] Phone number is verified
   - [ ] Template `tippy_guard_welcome_v1` exists (if using templates)

2. **Test SMS Sending**
   - Register a test guard via API
   - Check `sms_events` table for SMS event record
   - Verify SMS was delivered

3. **Verify Configuration**
   - `SENDGRID_API_KEY` is valid
   - `SENDGRID_FROM_PHONE` or `WELCOME_SMS_SENDER_ID` is set
   - `SEND_GUARD_WELCOME_SMS` is `true`

---

## Step 4: Verify Yoco Credentials

### Run Test Script
```powershell
.\scripts\test-yoco-credentials.ps1 -Environment production
```

### Manual Verification

1. **Check Yoco Dashboard**
   - [ ] Account is active
   - [ ] API keys are valid (test or live)
   - [ ] Webhook URL is configured: `https://api.tippy.co.za/payments/webhook`
   - [ ] Webhook secret matches `YOCO_WEBHOOK_SECRET`

2. **Verify Key Format**
   - Public key: `pk_live_...` or `pk_test_...`
   - Secret key: `sk_live_...` or `sk_test_...`

3. **Test Payment Creation**
   - Use Yoco test card: `4242 4242 4242 4242`
   - Create test payment via `POST /payments/create`
   - Verify webhook is received

---

## Step 5: Post-Deployment Verification

### Run Comprehensive Test Suite
```powershell
.\scripts\test-post-deployment.ps1 `
  -ApiBaseUrl "https://api.tippy.co.za" `
  -AdminToken "<admin-jwt-token>" `
  -ReferrerToken "<referrer-jwt-token>" `
  -GuardToken "<guard-jwt-token>" `
  -TestPhone "+27721234567"
```

### Manual Tests

#### 1. Health Check
```bash
curl https://api.tippy.co.za/health
```
**Expected**: `{"status":"ok","timestamp":"..."}`

#### 2. Guard Registration (Admin)
```bash
curl -X POST https://api.tippy.co.za/guards/register \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_phone": "+27721234567",
    "name": "Test Guard",
    "language": "en"
  }'
```
**Expected**: `201 Created` with `guard_id` and `sms_status`

#### 3. Verify SMS Delivery
```sql
-- Check sms_events table
SELECT id, recipient_msisdn_masked, status, sent_at, error_message
FROM sms_events
WHERE event_type = 'welcome_sms'
ORDER BY created_at DESC
LIMIT 1;
```
**Expected**: Status `sent`, `sent_at` populated, no error

#### 4. Guard Earnings
```bash
curl https://api.tippy.co.za/guards/me/earnings \
  -H "Authorization: Bearer <guard-token>"
```
**Expected**: `200 OK` with earnings summary

#### 5. Guard Payouts
```bash
curl https://api.tippy.co.za/guards/me/payouts \
  -H "Authorization: Bearer <guard-token>"
```
**Expected**: `200 OK` with payout history

#### 6. Referrer Guards List
```bash
curl https://api.tippy.co.za/referrers/me/guards \
  -H "Authorization: Bearer <referrer-token>"
```
**Expected**: `200 OK` with referred guards list (no PII)

#### 7. Payout Generation (Admin)
```bash
curl -X POST https://api.tippy.co.za/admin/payouts/generate-weekly \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```
**Expected**: `201 Created` with batch details and CSV preview

---

## Verification Summary

### Environment Variables
- [ ] All required variables set in Doppler (production)
- [ ] No placeholder values remaining
- [ ] All variables verified via script

### Database
- [ ] All migrations applied
- [ ] All required tables exist
- [ ] Indexes and constraints verified

### SendGrid SMS
- [ ] API key valid
- [ ] SMS API enabled
- [ ] Test SMS sent successfully
- [ ] SMS events logged in database

### Yoco
- [ ] API keys valid
- [ ] Webhook configured
- [ ] Test payment processed
- [ ] Webhook received and verified

### API Endpoints
- [ ] Health check: ✓
- [ ] Guard registration: ✓
- [ ] SMS delivery: ✓
- [ ] Guard earnings: ✓
- [ ] Guard payouts: ✓
- [ ] Referrer guards: ✓
- [ ] Payout generation: ✓

---

## Post-Deployment Monitoring

### Key Metrics
- Guard registration rate
- SMS delivery success rate
- API response times
- Error rates
- Payout generation success

### Log Locations
- Application logs: Check your logging service
- SMS events: `sms_events` table
- Audit events: `audit_log` table
- Guard registrations: `guard_registration_events` table

---

## Support

- **Deployment Guide**: `DEPLOYMENT_READINESS_P1_3.md`
- **Ledger**: `docs/TIPPY_DECISION_LEDGER.md`
- **Doppler Setup**: `ops/doppler/README.md`

---

**Status**: ✅ Ready for Production  
**Last Updated**: 2025-11-17


