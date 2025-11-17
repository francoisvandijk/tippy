# SendGrid SMS Integration Test
# Tests Welcome SMS functionality per Ledger §24.3
# Ledger Reference: §24.3 (Welcome SMS Policy), §25.2 (SendGrid)

param(
    [string]$TestPhone = "",
    [string]$Environment = "production"
)

Write-Host "=== SendGrid SMS Integration Test ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($TestPhone)) {
    Write-Host "Usage: .\scripts\test-sendgrid-sms.ps1 -TestPhone '+27721234567' [-Environment production]" -ForegroundColor Yellow
    exit 1
}

# Load environment variables from Doppler
Write-Host "[1] Loading environment variables from Doppler..." -ForegroundColor Yellow
try {
    $envVars = doppler secrets download --project tippy --config $Environment --format env-no-quotes 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to load Doppler secrets" -ForegroundColor Red
        exit 1
    }
    
    # Parse and set environment variables
    $envVars | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "  ✓ Environment variables loaded" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Error loading Doppler secrets: $_" -ForegroundColor Red
    exit 1
}

# Verify SendGrid configuration
Write-Host ""
Write-Host "[2] Verifying SendGrid Configuration..." -ForegroundColor Yellow

$sendgridApiKey = $env:SENDGRID_API_KEY
$sendgridFromPhone = $env:SENDGRID_FROM_PHONE
$welcomeSmsEnabled = $env:SEND_GUARD_WELCOME_SMS

if ([string]::IsNullOrEmpty($sendgridApiKey)) {
    Write-Host "  ✗ SENDGRID_API_KEY not configured" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  ✓ SENDGRID_API_KEY configured (length: $($sendgridApiKey.Length))" -ForegroundColor Green
}

if ([string]::IsNullOrEmpty($sendgridFromPhone)) {
    Write-Host "  ⚠ SENDGRID_FROM_PHONE not configured (using WELCOME_SMS_SENDER_ID if available)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ SENDGRID_FROM_PHONE configured: $sendgridFromPhone" -ForegroundColor Green
}

if ($welcomeSmsEnabled -eq "false") {
    Write-Host "  ⚠ SEND_GUARD_WELCOME_SMS is disabled" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ SEND_GUARD_WELCOME_SMS enabled" -ForegroundColor Green
}

# Test SendGrid API connection
Write-Host ""
Write-Host "[3] Testing SendGrid API Connection..." -ForegroundColor Yellow

try {
    $headers = @{
        "Authorization" = "Bearer $sendgridApiKey"
        "Content-Type" = "application/json"
    }
    
    # Test API key validity by checking user profile
    $response = Invoke-RestMethod -Uri "https://api.sendgrid.com/v3/user/profile" -Method Get -Headers $headers -ErrorAction Stop
    
    Write-Host "  ✓ SendGrid API connection successful" -ForegroundColor Green
    Write-Host "    User: $($response.username)" -ForegroundColor Gray
    Write-Host "    Email: $($response.email)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ SendGrid API connection failed: $_" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "    Error: Invalid API key" -ForegroundColor Red
    }
    exit 1
}

# Test SMS sending (if SendGrid SMS API is available)
Write-Host ""
Write-Host "[4] Testing SMS Sending..." -ForegroundColor Yellow
Write-Host "  Note: SendGrid SMS API may require additional setup" -ForegroundColor Gray
Write-Host "  Test phone: $TestPhone" -ForegroundColor Gray

# Note: Actual SMS sending test would require SendGrid SMS API setup
# This is a placeholder for the actual implementation
Write-Host "  ⚠ SMS sending test requires SendGrid SMS API configuration" -ForegroundColor Yellow
Write-Host "  Verify SMS capability in SendGrid dashboard" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✓ SendGrid API key valid" -ForegroundColor Green
Write-Host "✓ Configuration verified" -ForegroundColor Green
Write-Host "⚠ SMS sending requires SendGrid SMS API setup" -ForegroundColor Yellow

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Configure SendGrid SMS API in SendGrid dashboard" -ForegroundColor Gray
Write-Host "2. Set SENDGRID_FROM_PHONE or WELCOME_SMS_SENDER_ID" -ForegroundColor Gray
Write-Host "3. Test actual SMS sending via guard registration endpoint" -ForegroundColor Gray

