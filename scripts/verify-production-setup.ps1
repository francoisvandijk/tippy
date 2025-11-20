<#
  scripts/verify-production-setup.ps1

  Purpose:
  - Verify that production is configured to use LIVE Yoco keys.
  - Ensures live keys are present and do not look like test keys.
  - Never prints raw secrets; only reports presence and basic classification.
#>

Write-Host "=== Tippy: Verify production Yoco setup ===`n"

# Adjust these env var names to whatever production actually uses.
# From your PR review it looks like production uses YOCO_PUBLIC_KEY / YOCO_SECRET_KEY.
$publicKey = $env:YOCO_PUBLIC_KEY
$secretKey = $env:YOCO_SECRET_KEY

$ok = $true

if ([string]::IsNullOrWhiteSpace($publicKey)) {
    Write-Host "YOCO_PUBLIC_KEY: NOT CONFIGURED" -ForegroundColor Red
    $ok = $false
} else {
    if ($publicKey -like "*test*") {
        Write-Host "YOCO_PUBLIC_KEY appears to be a TEST key (contains 'test')." -ForegroundColor Red
        $ok = $false
    } else {
        Write-Host "YOCO_PUBLIC_KEY: configured (length: $($publicKey.Length))" -ForegroundColor Green
    }
}

if ([string]::IsNullOrWhiteSpace($secretKey)) {
    Write-Host "YOCO_SECRET_KEY: NOT CONFIGURED" -ForegroundColor Red
    $ok = $false
} else {
    if ($secretKey -like "*test*") {
        Write-Host "YOCO_SECRET_KEY appears to be a TEST key (contains 'test')." -ForegroundColor Red
        $ok = $false
    } else {
        Write-Host "YOCO_SECRET_KEY: configured (length: $($secretKey.Length))" -ForegroundColor Green
    }
}

if (-not $ok) {
    Write-Host "`nProduction Yoco setup is NOT valid (missing or test keys)." -ForegroundColor Red
    exit 1
}

Write-Host "`nProduction Yoco setup looks valid (live keys present, no 'test' markers detected)." -ForegroundColor Green
exit 0
