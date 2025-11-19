# Add Yoco Secrets to Doppler
# Phase 2 - Yoco Secrets Integration
# Ledger Reference: §25 (Environment, Credentials & Secrets Management)
#
# This script adds the Yoco test and live keys to Doppler environments.
# Run this script after Phase 2 implementation to configure Yoco secrets.

param(
    [Parameter(Mandatory=$true)]
    [string]$DopplerAdminToken,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "tippy",
    
    [Parameter(Mandatory=$false)]
    [string]$YocoTestPublicKey = $env:YOCO_TEST_PUBLIC_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$YocoTestSecretKey = $env:YOCO_TEST_SECRET_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$YocoLivePublicKey = $env:YOCO_LIVE_PUBLIC_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$YocoLiveSecretKey = $env:YOCO_LIVE_SECRET_KEY
)

$ErrorActionPreference = "Stop"

Write-Host "=== Adding Yoco Secrets to Doppler ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectName" -ForegroundColor Gray
Write-Host ""
Write-Host "NOTE: Keys must be provided via environment variables or parameters" -ForegroundColor Yellow
Write-Host "Do NOT hard-code keys in this script per Ledger §25" -ForegroundColor Yellow
Write-Host ""

$testKeys = @{
    "YOCO_TEST_PUBLIC_KEY" = $YocoTestPublicKey
    "YOCO_TEST_SECRET_KEY" = $YocoTestSecretKey
}

# Live keys (for production)
$liveKeys = @{
    "YOCO_LIVE_PUBLIC_KEY" = $YocoLivePublicKey
    "YOCO_LIVE_SECRET_KEY" = $YocoLiveSecretKey
}

# Webhook secret (shared across environments)
$webhookSecret = ""

# Environments to configure
$environments = @("development", "staging", "production")

# Set Doppler token
$env:DOPPLER_TOKEN = $DopplerAdminToken

foreach ($env in $environments) {
    Write-Host "Configuring environment: $env" -ForegroundColor Yellow
    
    # Add test keys to dev/staging, live keys to production
    if ($env -eq "production") {
        $keysToAdd = $liveKeys
        Write-Host "  Adding LIVE keys for production..." -ForegroundColor Gray
    } else {
        $keysToAdd = $testKeys
        Write-Host "  Adding TEST keys for $env..." -ForegroundColor Gray
    }
    
    foreach ($key in $keysToAdd.Keys) {
        $value = $keysToAdd[$key]
        if ([string]::IsNullOrEmpty($value)) {
            Write-Host "    ⚠ Skipping $key (empty value)" -ForegroundColor Yellow
            continue
        }
        
        Write-Host "    Setting $key..." -ForegroundColor Gray
        doppler secrets set "${key}=$value" --project="$ProjectName" --config="$env" --token=$DopplerAdminToken 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "      ✓ $key set" -ForegroundColor Green
        } else {
            Write-Host "      ✗ Failed to set $key" -ForegroundColor Red
        }
    }
    
    # Add webhook secret if provided
    if (-not [string]::IsNullOrEmpty($webhookSecret)) {
        Write-Host "    Setting YOCO_WEBHOOK_SECRET..." -ForegroundColor Gray
        doppler secrets set "YOCO_WEBHOOK_SECRET=$webhookSecret" --project="$ProjectName" --config="$env" --token=$DopplerAdminToken 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "      ✓ YOCO_WEBHOOK_SECRET set" -ForegroundColor Green
        } else {
            Write-Host "      ✗ Failed to set YOCO_WEBHOOK_SECRET" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}

# Clear token from environment
Remove-Item Env:\DOPPLER_TOKEN -ErrorAction SilentlyContinue

Write-Host "=== Yoco Secrets Configuration Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify secrets in Doppler dashboard" -ForegroundColor Gray
Write-Host "2. Run: .\scripts\test-yoco-credentials.ps1 -Environment development" -ForegroundColor Gray
Write-Host "3. Run: .\scripts\test-yoco-credentials.ps1 -Environment production" -ForegroundColor Gray

