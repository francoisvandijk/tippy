# Production Setup Verification Script
# Tippy P1.3 Deployment Verification
# Ledger Reference: §25 (Secrets Management), §24.3 (Welcome SMS), §9 (Payouts)

param(
    [string]$Environment = "production",
    [switch]$SkipDoppler = $false
)

Write-Host "=== Tippy P1.3 Production Setup Verification ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host ""

$errors = @()
$warnings = @()

# 1. Verify Doppler Access
if (-not $SkipDoppler) {
    Write-Host "[1] Verifying Doppler Access..." -ForegroundColor Yellow
    
    try {
        $dopplerVersion = doppler --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Doppler CLI installed: $dopplerVersion" -ForegroundColor Green
        } else {
            $errors += "Doppler CLI not found. Install: curl -sLf https://cli.doppler.com/install.sh | sh"
        }
    } catch {
        $errors += "Doppler CLI not found. Install: curl -sLf https://cli.doppler.com/install.sh | sh"
    }
    
    # Check if logged in
    try {
        $dopplerMe = doppler me 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Doppler authentication verified" -ForegroundColor Green
        } else {
            $warnings += "Doppler not authenticated. Run: doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>"
        }
    } catch {
        $warnings += "Doppler authentication check failed"
    }
    
    # Verify project and environment exist
    try {
        $projectCheck = doppler projects get tippy 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Doppler project 'tippy' exists" -ForegroundColor Green
        } else {
            $errors += "Doppler project 'tippy' not found. Create: doppler projects create tippy"
        }
    } catch {
        $errors += "Failed to check Doppler project"
    }
    
    try {
        $envCheck = doppler environments get $Environment --project tippy 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Doppler environment '$Environment' exists" -ForegroundColor Green
        } else {
            $errors += "Doppler environment '$Environment' not found. Create: doppler environments create $Environment --project tippy"
        }
    } catch {
        $errors += "Failed to check Doppler environment"
    }
}

# 2. Required Environment Variables Checklist
Write-Host ""
Write-Host "[2] Required Environment Variables Checklist..." -ForegroundColor Yellow

$requiredVars = @(
    # Database
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_JWT_SECRET",
    
    # Yoco
    "YOCO_PUBLIC_KEY",
    "YOCO_SECRET_KEY",
    "YOCO_WEBHOOK_SECRET",
    
    # SendGrid (Primary SMS/Email)
    "SENDGRID_API_KEY",
    "SENDGRID_FROM_PHONE",
    "SENDGRID_FROM_EMAIL",
    
    # Twilio (Fallback SMS)
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    
    # Configuration
    "SEND_GUARD_WELCOME_SMS",
    "WELCOME_SMS_TEMPLATE_ID",
    "WELCOME_SMS_SENDER_ID",
    "WELCOME_SMS_RETRY_COUNT",
    "GUARD_REGS_PER_REFERRER_PER_DAY",
    "GUARD_REGS_PER_DEVICE_PER_DAY",
    "GUARD_REGS_PER_IP_PER_HOUR",
    "PAYOUT_MIN_ELIGIBILITY_ZAR",
    "CASH_SEND_FEE_ZAR"
)

Write-Host "  Required variables ($($requiredVars.Count) total):" -ForegroundColor Gray
foreach ($var in $requiredVars) {
    Write-Host "    - $var" -ForegroundColor Gray
}

if (-not $SkipDoppler) {
    Write-Host ""
    Write-Host "  Checking variables in Doppler ($Environment)..." -ForegroundColor Yellow
    
    # Try to get secrets (without printing values)
    try {
        $secrets = doppler secrets get --project tippy --config $Environment --only-names 2>&1
        if ($LASTEXITCODE -eq 0) {
            $configuredVars = $secrets | ForEach-Object { $_.Trim() }
            
            foreach ($var in $requiredVars) {
                if ($configuredVars -contains $var) {
                    Write-Host "    ✓ $var" -ForegroundColor Green
                } else {
                    $errors += "Missing environment variable: $var"
                    Write-Host "    ✗ $var (MISSING)" -ForegroundColor Red
                }
            }
        } else {
            $warnings += "Could not retrieve secrets list from Doppler. Verify access."
        }
    } catch {
        $warnings += "Failed to check Doppler secrets. Verify authentication."
    }
}

# 3. Database Migration Verification
Write-Host ""
Write-Host "[3] Database Migration Verification..." -ForegroundColor Yellow
Write-Host "  Action required: Manually verify all migrations are applied" -ForegroundColor Gray
Write-Host "  Migration files in: infra/db/migrations/" -ForegroundColor Gray
Write-Host "  Key migrations for P1.3:" -ForegroundColor Gray
Write-Host "    - 0021_guards.sql" -ForegroundColor Gray
Write-Host "    - 0023_referrers.sql" -ForegroundColor Gray
Write-Host "    - 0024_referrals.sql" -ForegroundColor Gray
Write-Host "    - 0028_payout_batches.sql" -ForegroundColor Gray
Write-Host "    - 0029_payout_batch_items.sql" -ForegroundColor Gray
Write-Host "    - 0031_sms_events.sql" -ForegroundColor Gray
Write-Host "    - 0035_guard_registration_events.sql" -ForegroundColor Gray

# 4. Summary
Write-Host ""
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan

if ($errors.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✓ All checks passed!" -ForegroundColor Green
    exit 0
} else {
    if ($errors.Count -gt 0) {
        Write-Host "✗ Errors found ($($errors.Count)):" -ForegroundColor Red
        foreach ($error in $errors) {
            Write-Host "  - $error" -ForegroundColor Red
        }
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "⚠ Warnings ($($warnings.Count)):" -ForegroundColor Yellow
        foreach ($warning in $warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
    
    exit 1
}

