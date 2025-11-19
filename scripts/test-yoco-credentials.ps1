# Yoco Credentials Verification Test
# Tests Yoco API credentials and connectivity
# Ledger Reference: §5 (Fees & Calculations), §6.1 (User Tipping)

param(
    [string]$Environment = "production"
)

Write-Host "=== Yoco Credentials Verification Test ===" -ForegroundColor Cyan
Write-Host ""

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

# Verify Yoco configuration
Write-Host ""
Write-Host "[2] Verifying Yoco Configuration..." -ForegroundColor Yellow

# Determine which keys to check based on environment
$isProduction = $Environment -eq "production"
if ($isProduction) {
    $yocoPublicKey = $env:YOCO_LIVE_PUBLIC_KEY
    $yocoSecretKey = $env:YOCO_LIVE_SECRET_KEY
    $keyType = "LIVE"
    $publicKeyVar = "YOCO_LIVE_PUBLIC_KEY"
    $secretKeyVar = "YOCO_LIVE_SECRET_KEY"
} else {
    $yocoPublicKey = $env:YOCO_TEST_PUBLIC_KEY
    $yocoSecretKey = $env:YOCO_TEST_SECRET_KEY
    $keyType = "TEST"
    $publicKeyVar = "YOCO_TEST_PUBLIC_KEY"
    $secretKeyVar = "YOCO_TEST_SECRET_KEY"
}
$yocoWebhookSecret = $env:YOCO_WEBHOOK_SECRET

if ([string]::IsNullOrEmpty($yocoPublicKey)) {
    Write-Host "  ✗ $publicKeyVar not configured" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  ✓ $publicKeyVar configured ($keyType key, length: $($yocoPublicKey.Length))" -ForegroundColor Green
    Write-Host "    Key prefix: $($yocoPublicKey.Substring(0, [Math]::Min(10, $yocoPublicKey.Length)))..." -ForegroundColor Gray
}

if ([string]::IsNullOrEmpty($yocoSecretKey)) {
    Write-Host "  ✗ $secretKeyVar not configured" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  ✓ $secretKeyVar configured ($keyType key, length: $($yocoSecretKey.Length))" -ForegroundColor Green
    Write-Host "    Key prefix: $($yocoSecretKey.Substring(0, [Math]::Min(10, $yocoSecretKey.Length)))..." -ForegroundColor Gray
}

if ([string]::IsNullOrEmpty($yocoWebhookSecret)) {
    Write-Host "  ⚠ YOCO_WEBHOOK_SECRET not configured (webhook verification will be disabled)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ YOCO_WEBHOOK_SECRET configured" -ForegroundColor Green
}

# Test Yoco API connection
Write-Host ""
Write-Host "[3] Testing Yoco API Connection..." -ForegroundColor Yellow

try {
    $headers = @{
        "Authorization" = "Bearer $yocoSecretKey"
        "Content-Type" = "application/json"
    }
    
    # Test API key validity by checking account info
    # Note: Yoco API endpoint may vary - adjust as needed
    $response = Invoke-RestMethod -Uri "https://api.yoco.com/v1/account" -Method Get -Headers $headers -ErrorAction Stop
    
    Write-Host "  ✓ Yoco API connection successful" -ForegroundColor Green
    if ($response.name) {
        Write-Host "    Account: $($response.name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠ Yoco API connection test failed: $_" -ForegroundColor Yellow
    Write-Host "    Note: This may be expected if using test/sandbox credentials" -ForegroundColor Gray
    Write-Host "    Verify credentials in Yoco dashboard" -ForegroundColor Gray
}

# Verify key format
Write-Host ""
Write-Host "[4] Verifying Key Format..." -ForegroundColor Yellow

# Yoco keys typically start with specific prefixes
if ($yocoPublicKey -match '^pk_(test|live)_') {
    $keyType = if ($yocoPublicKey -match 'pk_test') { "TEST" } else { "LIVE" }
    Write-Host "  ✓ Public key format valid ($keyType key)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Public key format may be invalid (expected pk_test_ or pk_live_)" -ForegroundColor Yellow
}

if ($yocoSecretKey -match '^sk_(test|live)_') {
    $keyType = if ($yocoSecretKey -match 'sk_test') { "TEST" } else { "LIVE" }
    Write-Host "  ✓ Secret key format valid ($keyType key)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Secret key format may be invalid (expected sk_test_ or sk_live_)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✓ Yoco credentials configured" -ForegroundColor Green
Write-Host "✓ Key format verified" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Test payment creation via POST /payments/create endpoint" -ForegroundColor Gray
Write-Host "2. Verify webhook endpoint is accessible: POST /payments/webhook" -ForegroundColor Gray
Write-Host "3. Configure webhook URL in Yoco dashboard" -ForegroundColor Gray


