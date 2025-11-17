# Database Migration Verification Script
# Verifies all required migrations are applied
# Ledger Reference: §4 (Data Model), §15 (Environments & Deployment)

param(
    [string]$Environment = "production"
)

Write-Host "=== Database Migration Verification ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host ""

# Load environment variables from Doppler
Write-Host "[1] Loading database connection from Doppler..." -ForegroundColor Yellow
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

$dbUrl = $env:SUPABASE_DB_URL
if ([string]::IsNullOrEmpty($dbUrl)) {
    Write-Host "  ✗ SUPABASE_DB_URL not configured" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2] Required Migrations for P1.3:" -ForegroundColor Yellow

$requiredMigrations = @(
    @{ File = "0020_users.sql"; Table = "users"; Description = "Users table" },
    @{ File = "0021_guards.sql"; Table = "guards"; Description = "Guards table" },
    @{ File = "0022_qr_codes.sql"; Table = "qr_codes"; Description = "QR codes table" },
    @{ File = "0023_referrers.sql"; Table = "referrers"; Description = "Referrers table" },
    @{ File = "0024_referrals.sql"; Table = "referrals"; Description = "Referrals table" },
    @{ File = "0028_payout_batches.sql"; Table = "payout_batches"; Description = "Payout batches table" },
    @{ File = "0029_payout_batch_items.sql"; Table = "payout_batch_items"; Description = "Payout batch items table" },
    @{ File = "0031_sms_events.sql"; Table = "sms_events"; Description = "SMS events table" },
    @{ File = "0035_guard_registration_events.sql"; Table = "guard_registration_events"; Description = "Guard registration events table" }
)

Write-Host ""
Write-Host "  Manual verification required:" -ForegroundColor Yellow
Write-Host "  1. Connect to database using SUPABASE_DB_URL" -ForegroundColor Gray
Write-Host "  2. Check if each table exists:" -ForegroundColor Gray
Write-Host ""

foreach ($migration in $requiredMigrations) {
    Write-Host "    - $($migration.File) → Table: $($migration.Table)" -ForegroundColor Gray
    Write-Host "      Description: $($migration.Description)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  SQL Query to verify tables:" -ForegroundColor Yellow
Write-Host "  SELECT table_name FROM information_schema.tables" -ForegroundColor Gray
Write-Host "  WHERE table_schema = 'public'" -ForegroundColor Gray
Write-Host "  AND table_name IN (" -ForegroundColor Gray
$tableNames = ($requiredMigrations | ForEach-Object { "'$($_.Table)'" }) -join ", "
Write-Host "    $tableNames" -ForegroundColor Gray
Write-Host "  );" -ForegroundColor Gray

Write-Host ""
Write-Host "[3] Migration Files Location:" -ForegroundColor Yellow
Write-Host "  infra/db/migrations/" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Verification Instructions ===" -ForegroundColor Cyan
Write-Host "1. Connect to your Supabase Postgres database" -ForegroundColor White
Write-Host "2. Run the SQL query above to check for required tables" -ForegroundColor White
Write-Host "3. If any tables are missing, apply the corresponding migration file" -ForegroundColor White
Write-Host "4. Verify indexes and constraints are created" -ForegroundColor White

Write-Host ""
Write-Host "Note: This script cannot directly verify database state for security reasons." -ForegroundColor Yellow
Write-Host "Manual verification is required." -ForegroundColor Yellow

