# Doppler Setup Script for Tippy Project
# Idempotent: Safe to run multiple times
# Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

param(
    [Parameter(Mandatory=$true)]
    [string]$DopplerAdminToken,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectName = "tippy",
    
    [Parameter(Mandatory=$false)]
    [string[]]$Environments = @("development", "staging", "production")
)

$ErrorActionPreference = "Stop"

# Validate Doppler CLI is installed
Write-Host "Checking Doppler CLI installation..." -ForegroundColor Cyan
try {
    $dopplerVersion = doppler --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Doppler CLI not found"
    }
    Write-Host "Doppler CLI found: $dopplerVersion" -ForegroundColor Green
} catch {
    Write-Host "Installing Doppler CLI..." -ForegroundColor Yellow
    curl.exe -sLf https://cli.doppler.com/install.sh | sh
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Doppler CLI. Please install manually: https://docs.doppler.com/docs/install-cli"
        exit 1
    }
}

# Validate admin access
Write-Host "Validating Doppler admin access..." -ForegroundColor Cyan
$env:DOPPLER_TOKEN = $DopplerAdminToken
doppler setup --non-interactive --token=$DopplerAdminToken 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to authenticate with Doppler. Check token permissions."
    exit 1
}
Write-Host "✓ Admin access validated" -ForegroundColor Green

# Create project (idempotent)
Write-Host "Ensuring project '$ProjectName' exists..." -ForegroundColor Cyan
$projectExists = doppler projects get "$ProjectName" --token=$DopplerAdminToken 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating project '$ProjectName'..." -ForegroundColor Yellow
    doppler projects create "$ProjectName" --token=$DopplerAdminToken 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create project '$ProjectName'"
        exit 1
    }
    Write-Host "✓ Project '$ProjectName' created" -ForegroundColor Green
} else {
    Write-Host "✓ Project '$ProjectName' already exists" -ForegroundColor Green
}

# Create environments (idempotent)
foreach ($env in $Environments) {
    Write-Host "Ensuring environment '$env' exists..." -ForegroundColor Cyan
    $envExists = doppler environments get "$env" --project="$ProjectName" --token=$DopplerAdminToken 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating environment '$env'..." -ForegroundColor Yellow
        doppler environments create "$env" --project="$ProjectName" --token=$DopplerAdminToken 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create environment '$env'"
            exit 1
        }
        Write-Host "✓ Environment '$env' created" -ForegroundColor Green
    } else {
        Write-Host "✓ Environment '$env' already exists" -ForegroundColor Green
    }
}

Write-Host "`n✓ Doppler setup complete!" -ForegroundColor Green
Write-Host "Project: $ProjectName" -ForegroundColor Cyan
Write-Host "Environments: $($Environments -join ', ')" -ForegroundColor Cyan

# Clear token from environment
Remove-Item Env:\DOPPLER_TOKEN -ErrorAction SilentlyContinue

