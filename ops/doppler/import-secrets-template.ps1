# Secret Import Template for Tippy
# This script provides a template for importing secrets into Doppler
# Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

param(
    [Parameter(Mandatory=$true)]
    [string]$DopplerAdminToken,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("development", "staging", "production")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "tippy",
    
    [Parameter(Mandatory=$false)]
    [string]$SecretsFile = ""
)

$ErrorActionPreference = "Stop"

# Define canonical secret keys
$SecretKeys = @(
    "TIPPY_DB_URL",
    "TIPPY_DB_PASSWORD",
    "TIPPY_YOCO_API_KEY",
    "TIPPY_SENDGRID_API_KEY",
    "TIPPY_TWILIO_API_KEY",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "SENTRY_DSN"
)

Write-Host "Secret Import Template for Environment: $Environment" -ForegroundColor Cyan
Write-Host "Project: $ProjectName" -ForegroundColor Cyan

# If secrets file provided, import from file
if ($SecretsFile -and (Test-Path $SecretsFile)) {
    Write-Host "`nImporting secrets from file: $SecretsFile" -ForegroundColor Yellow
    Write-Host "⚠️  WARNING: Ensure file is encrypted and will be deleted after import!" -ForegroundColor Red
    
    $secrets = Get-Content $SecretsFile | ConvertFrom-Json
    
    foreach ($key in $SecretKeys) {
        if ($secrets.$key) {
            Write-Host "Setting $key..." -ForegroundColor Gray
            $env:DOPPLER_TOKEN = $DopplerAdminToken
            doppler secrets set "${key}=$($secrets.$key)" --project="$ProjectName" --config="$Environment" --token=$DopplerAdminToken 2>&1 | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ $key set" -ForegroundColor Green
            } else {
                Write-Warning "  ✗ Failed to set $key"
            }
        }
    }
    
    # Delete the file after import
    Write-Host "`nDeleting secrets file for security..." -ForegroundColor Yellow
    Remove-Item $SecretsFile -Force
    Write-Host "✓ Secrets file deleted" -ForegroundColor Green
} else {
    # Interactive mode: prompt for each secret
    Write-Host "`nInteractive secret import mode" -ForegroundColor Yellow
    Write-Host "⚠️  For production, this requires explicit human approval per § 25" -ForegroundColor Red
    
    if ($Environment -eq "production") {
        Write-Host "`n⚠️  PRODUCTION SECRETS IMPORT - REQUIRES APPROVAL" -ForegroundColor Red
        Write-Host "Please confirm you have approval to import production secrets:" -ForegroundColor Yellow
        $confirm = Read-Host "Type 'APPROVED' to continue"
        if ($confirm -ne "APPROVED") {
            Write-Host "Import cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
    
    $secretsToSet = @{}
    
    foreach ($key in $SecretKeys) {
        Write-Host "`nSecret: $key" -ForegroundColor Cyan
        $value = Read-Host "Enter value (input will be masked)" -AsSecureString
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
        )
        $secretsToSet[$key] = $plainValue
    }
    
    Write-Host "`nSetting secrets in Doppler..." -ForegroundColor Yellow
    $env:DOPPLER_TOKEN = $DopplerAdminToken
    
    foreach ($key in $secretsToSet.Keys) {
        Write-Host "Setting $key..." -ForegroundColor Gray
        doppler secrets set "${key}=$($secretsToSet[$key])" --project="$ProjectName" --config="$Environment" --token=$DopplerAdminToken 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ $key set" -ForegroundColor Green
        } else {
            Write-Warning "  ✗ Failed to set $key"
        }
    }
    
    # Clear secrets from memory
    $secretsToSet.Clear()
    [GC]::Collect()
}

# Clear token from environment
Remove-Item Env:\DOPPLER_TOKEN -ErrorAction SilentlyContinue

Write-Host "`n✓ Secret import complete for environment: $Environment" -ForegroundColor Green

# POPIA Compliance Note
Write-Host "`n📋 POPIA Compliance Reminder:" -ForegroundColor Cyan
Write-Host "   - Phone numbers (MSISDN) must be hashed (SHA256) before storage" -ForegroundColor Gray
Write-Host "   - Only last4 digits may be stored in masked audit exports" -ForegroundColor Gray
Write-Host "   - Ensure any MSISDN keys are transformed during ingestion" -ForegroundColor Gray

