# Create Doppler Service Tokens for Tippy
# Idempotent: Checks for existing tokens before creating
# Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

param(
    [Parameter(Mandatory=$true)]
    [string]$DopplerAdminToken,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "tippy"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating service tokens for Tippy..." -ForegroundColor Cyan

$env:DOPPLER_TOKEN = $DopplerAdminToken

# CI Token (read-only, development and staging)
Write-Host "`nCreating CI token (read-only, dev/staging)..." -ForegroundColor Yellow
$ciTokenName = "ci-token"
$ciTokenExists = doppler service-tokens get "$ciTokenName" --project="$ProjectName" --token=$DopplerAdminToken 2>&1

if ($LASTEXITCODE -ne 0) {
    # Create CI token
    $ciTokenOutput = doppler service-tokens create --name="$ciTokenName" --role="read_only" --environments="development,staging" --project="$ProjectName" --token=$DopplerAdminToken 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # Extract token from output (format: "dp.st.xxxxx")
        $ciToken = ($ciTokenOutput | Select-String -Pattern "dp\.st\.[a-zA-Z0-9]+").Matches.Value
        
        Write-Host "✓ CI token created: $ciTokenName" -ForegroundColor Green
        Write-Host "⚠️  TOKEN VALUE (store securely, will not be shown again):" -ForegroundColor Yellow
        Write-Host "   $ciToken" -ForegroundColor Yellow
        Write-Host "`n   Action Required: Add this token to GitHub repository secret 'DOPPLER_TOKEN_CI'" -ForegroundColor Cyan
        Write-Host "   https://github.com/francoisvandijk/tippy/settings/secrets/actions" -ForegroundColor Cyan
    } else {
        Write-Error "Failed to create CI token"
        exit 1
    }
} else {
    Write-Host "✓ CI token '$ciTokenName' already exists" -ForegroundColor Green
    Write-Host "   (Token value not shown for security)" -ForegroundColor Gray
}

# Deploy Token (deploy role, production only)
Write-Host "`nCreating deploy token (deploy role, production)..." -ForegroundColor Yellow
$deployTokenName = "deploy-token"
$deployTokenExists = doppler service-tokens get "$deployTokenName" --project="$ProjectName" --token=$DopplerAdminToken 2>&1

if ($LASTEXITCODE -ne 0) {
    # Create deploy token
    $deployTokenOutput = doppler service-tokens create --name="$deployTokenName" --role="deploy" --environments="production" --project="$ProjectName" --token=$DopplerAdminToken 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # Extract token from output
        $deployToken = ($deployTokenOutput | Select-String -Pattern "dp\.st\.[a-zA-Z0-9]+").Matches.Value
        
        Write-Host "✓ Deploy token created: $deployTokenName" -ForegroundColor Green
        Write-Host "⚠️  TOKEN VALUE (store securely, will not be shown again):" -ForegroundColor Yellow
        Write-Host "   $deployToken" -ForegroundColor Yellow
        Write-Host "`n   Action Required: Store this token in secure deployment tooling (not in repo)" -ForegroundColor Cyan
    } else {
        Write-Error "Failed to create deploy token"
        exit 1
    }
} else {
    Write-Host "✓ Deploy token '$deployTokenName' already exists" -ForegroundColor Green
    Write-Host "   (Token value not shown for security)" -ForegroundColor Gray
}

Write-Host "`n✓ Service token creation complete!" -ForegroundColor Green

# Clear token from environment
Remove-Item Env:\DOPPLER_TOKEN -ErrorAction SilentlyContinue

Write-Host "`n⚠️  IMPORTANT: Store the token values shown above securely via out-of-band channel." -ForegroundColor Yellow
Write-Host "   Never commit tokens to the repository or share in PR comments." -ForegroundColor Yellow

