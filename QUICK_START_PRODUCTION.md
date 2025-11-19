# P1.3 Production Setup - Quick Start Guide

**Status**: Ready for Production Deployment  
**Date**: 2025-11-17

---

## 🚀 Quick Start (5 Steps)

### Step 1: Set Environment Variables in Doppler

```powershell
# 1. Authenticate with Doppler
doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>

# 2. Verify project and environment exist
doppler projects get tippy
doppler environments get production --project tippy

# 3. Set all required variables (see PRODUCTION_SETUP_CHECKLIST.md for full list)
doppler secrets set SUPABASE_URL="https://xxx.supabase.co" --project tippy --config production
doppler secrets set SUPABASE_ANON_KEY="xxx" --project tippy --config production
doppler secrets set SUPABASE_SERVICE_ROLE_KEY="xxx" --project tippy --config production
doppler secrets set SUPABASE_DB_URL="postgresql://..." --project tippy --config production
doppler secrets set SUPABASE_JWT_SECRET="xxx" --project tippy --config production

# Yoco (Production - Live Keys)
doppler secrets set YOCO_LIVE_PUBLIC_KEY="pk_live_xxx" --project tippy --config production
doppler secrets set YOCO_LIVE_SECRET_KEY="sk_live_xxx" --project tippy --config production
doppler secrets set YOCO_WEBHOOK_SECRET="xxx" --project tippy --config production

# Yoco (Development/Test - Test Keys)
doppler secrets set YOCO_TEST_PUBLIC_KEY="pk_test_xxx" --project tippy --config development
doppler secrets set YOCO_TEST_SECRET_KEY="sk_test_xxx" --project tippy --config development

# SendGrid
doppler secrets set SENDGRID_API_KEY="SG.xxx" --project tippy --config production
doppler secrets set SENDGRID_FROM_PHONE="+27xxx" --project tippy --config production
doppler secrets set SENDGRID_FROM_EMAIL="noreply@tippy.co.za" --project tippy --config production

# Configuration
doppler secrets set SEND_GUARD_WELCOME_SMS="true" --project tippy --config production
doppler secrets set WELCOME_SMS_TEMPLATE_ID="tippy_guard_welcome_v1" --project tippy --config production
doppler secrets set GUARD_REGS_PER_REFERRER_PER_DAY="15" --project tippy --config production
doppler secrets set PAYOUT_MIN_ELIGIBILITY_ZAR="50000" --project tippy --config production
doppler secrets set CASH_SEND_FEE_ZAR="900" --project tippy --config production

# 4. Verify all variables are set
.\scripts\verify-production-setup.ps1 -Environment production
```

### Step 2: Verify Database Migrations

```powershell
# Run verification script
.\scripts\verify-database-migrations.ps1 -Environment production

# Manually verify tables exist (connect to database)
# See PRODUCTION_SETUP_CHECKLIST.md for SQL queries
```

### Step 3: Test SendGrid SMS Integration

```powershell
# Test SendGrid API connection and configuration
.\scripts\test-sendgrid-sms.ps1 -TestPhone "+27721234567" -Environment production
```

### Step 4: Verify Yoco Credentials

```powershell
# Test Yoco API credentials
.\scripts\test-yoco-credentials.ps1 -Environment production
```

### Step 5: Post-Deployment Verification

```powershell
# Run comprehensive endpoint tests
.\scripts\test-post-deployment.ps1 `
  -ApiBaseUrl "https://api.tippy.co.za" `
  -AdminToken "<admin-jwt-token>" `
  -ReferrerToken "<referrer-jwt-token>" `
  -GuardToken "<guard-jwt-token>" `
  -TestPhone "+27721234567"
```

---

## 📋 Detailed Checklists

- **Full Setup Checklist**: `PRODUCTION_SETUP_CHECKLIST.md`
- **Deployment Readiness**: `DEPLOYMENT_READINESS_P1_3.md`

---

## 🔧 Scripts Available

All scripts are in `scripts/` directory:

1. **verify-production-setup.ps1** - Verify Doppler and environment variables
2. **verify-database-migrations.ps1** - Check database migration status
3. **test-sendgrid-sms.ps1** - Test SendGrid SMS integration
4. **test-yoco-credentials.ps1** - Verify Yoco API credentials
5. **test-post-deployment.ps1** - Comprehensive endpoint testing

---

## ✅ Success Criteria

All steps complete when:
- ✅ All environment variables set in Doppler (production)
- ✅ All database migrations applied
- ✅ SendGrid SMS test passes
- ✅ Yoco credentials verified
- ✅ All API endpoints respond correctly
- ✅ SMS delivery confirmed
- ✅ Payout generation works

---

## 📞 Support

- **Ledger**: `docs/TIPPY_DECISION_LEDGER.md`
- **Doppler Setup**: `ops/doppler/README.md`
- **Governance**: `docs/PHASE_2_GOVERNANCE_CLOSE_OUT.md`

---

**Ready to deploy!** 🚀


