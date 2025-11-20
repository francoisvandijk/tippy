<#
    scripts/test-post-deployment.ps1

    Purpose:
    - Tests all P1.3 endpoints and functionality.
    - Verifies API endpoints are working correctly.
    - Never prints raw secrets or tokens.

    Ledger Reference: §7 (API Surface), §24.3, §24.4, §9
#>

param(
    [string]$ApiBaseUrl = "http://localhost:3000",
    [string]$AdminToken = "",
    [string]$ReferrerToken = "",
    [string]$GuardToken = "",
    [string]$TestPhone = "+27721234567"
)

Write-Host "=== Post-Deployment Verification Tests ===" -ForegroundColor Cyan
Write-Host "API Base URL: $ApiBaseUrl" -ForegroundColor Yellow
Write-Host ""

$testResults = @()
$errors = @()

# Helper function to make API calls
function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [string]$ExpectedStatus = "200",
        [string]$Description = ""
    )
    
    $url = "$ApiBaseUrl$Path"
    Write-Host "[TEST] $Description" -ForegroundColor Yellow
    Write-Host "  $Method $Path" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $Headers
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @params
        $statusCode = 200
        
        if ($statusCode -eq $ExpectedStatus -or $ExpectedStatus -eq "200") {
            Write-Host "  ✓ PASS (Status: $statusCode)" -ForegroundColor Green
            $script:testResults += @{ Test = $Description; Status = "PASS"; StatusCode = $statusCode }
            return $true
        } else {
            Write-Host "  ✗ FAIL (Expected: $ExpectedStatus, Got: $statusCode)" -ForegroundColor Red
            $script:testResults += @{ Test = $Description; Status = "FAIL"; StatusCode = $statusCode }
            $script:errors += "$Description - Expected status $ExpectedStatus, got $statusCode"
            return $false
        }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__
        }
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ✓ PASS (Status: $statusCode)" -ForegroundColor Green
            $script:testResults += @{ Test = $Description; Status = "PASS"; StatusCode = $statusCode }
            return $true
        } else {
            Write-Host "  ✗ FAIL: $($_.Exception.Message)" -ForegroundColor Red
            $script:testResults += @{ Test = $Description; Status = "FAIL"; Error = $_.Exception.Message }
            $script:errors += "$Description - $($_.Exception.Message)"
            return $false
        }
    }
}

# 1. Health Check
Write-Host "=== [1] Health Check ===" -ForegroundColor Cyan
Test-Endpoint -Method "GET" -Path "/health" -Description "Health check endpoint" -ExpectedStatus "200"

# 2. Guard Registration (Admin)
Write-Host ""
Write-Host "=== [2] Guard Registration (Admin) ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($AdminToken)) {
    Write-Host "  ⚠ Skipping - Admin token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $AdminToken"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        primary_phone = $TestPhone
        name = "Test Guard (Admin Registration)"
        language = "en"
    }
    
    $result = Test-Endpoint -Method "POST" -Path "/guards/register" -Headers $headers -Body $body -Description "Admin guard registration" -ExpectedStatus "201"
    
    if ($result) {
        Write-Host "  ✓ Guard registered successfully" -ForegroundColor Green
        Write-Host "  ⚠ Verify SMS was sent (check sms_events table)" -ForegroundColor Yellow
    }
}

# 3. Guard Registration (Referrer)
Write-Host ""
Write-Host "=== [3] Guard Registration (Referrer) ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($ReferrerToken)) {
    Write-Host "  ⚠ Skipping - Referrer token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $ReferrerToken"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        primary_phone = "+2772" + (Get-Random -Minimum 1000000 -Maximum 9999999)
        name = "Test Guard (Referrer Registration)"
        language = "en"
    }
    
    Test-Endpoint -Method "POST" -Path "/guards/register" -Headers $headers -Body $body -Description "Referrer guard registration" -ExpectedStatus "201"
}

# 4. Guard Earnings
Write-Host ""
Write-Host "=== [4] Guard Earnings Endpoint ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($GuardToken)) {
    Write-Host "  ⚠ Skipping - Guard token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $GuardToken"
    }
    
    Test-Endpoint -Method "GET" -Path "/guards/me/earnings" -Headers $headers -Description "Guard earnings summary" -ExpectedStatus "200"
}

# 5. Guard Payouts
Write-Host ""
Write-Host "=== [5] Guard Payouts Endpoint ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($GuardToken)) {
    Write-Host "  ⚠ Skipping - Guard token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $GuardToken"
    }
    
    Test-Endpoint -Method "GET" -Path "/guards/me/payouts" -Headers $headers -Description "Guard payout history" -ExpectedStatus "200"
}

# 6. Referrer Guards List
Write-Host ""
Write-Host "=== [6] Referrer Guards List ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($ReferrerToken)) {
    Write-Host "  ⚠ Skipping - Referrer token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $ReferrerToken"
    }
    
    Test-Endpoint -Method "GET" -Path "/referrers/me/guards" -Headers $headers -Description "Referrer guards list" -ExpectedStatus "200"
}

# 7. Payout Generation (Admin)
Write-Host ""
Write-Host "=== [7] Payout Generation (Admin) ===" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($AdminToken)) {
    Write-Host "  ⚠ Skipping - Admin token not provided" -ForegroundColor Yellow
} else {
    $headers = @{
        "Authorization" = "Bearer $AdminToken"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        force = $false
    }
    
    Test-Endpoint -Method "POST" -Path "/admin/payouts/generate-weekly" -Headers $headers -Body $body -Description "Admin payout generation" -ExpectedStatus "201"
}

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "Errors:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host ""
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    exit 0
}

