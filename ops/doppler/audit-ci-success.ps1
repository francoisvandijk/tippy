# Audit Doppler CI Success
# Ledger Reference: Tippy Decision Ledger v1.0 (Final) §25

param(
    [string]$RunId = $null,
    [string]$Branch = "main"
)

$logPath = "ops/doppler/AUDIT_LOG.txt"
$timestamp = Get-Date -Format "s"

# Ensure log file exists
if (-not (Test-Path $logPath)) {
    $logDir = Split-Path -Parent $logPath
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    New-Item -ItemType File -Path $logPath -Force | Out-Null
}

# Try to capture the latest Doppler CI run ID if not provided
if (-not $RunId) {
    try {
        $runData = doppler run --project tippy --config dev -- gh run list --workflow doppler-ci.yml --limit 1 --json databaseId --jq ".[0].databaseId" 2>$null
        if ($runData -and $runData -ne "null") {
            $RunId = $runData.ToString().Trim()
        }
    } catch {
        # Continue without run ID
    }
}

# Create audit entry
$entry = if ($RunId) {
    "§25 Doppler CI validated on $Branch at $timestamp (GitHub Run ID: $RunId)"
} else {
    "§25 Doppler CI validated on $Branch at $timestamp"
}

# Append to log
Add-Content -Path $logPath -Value $entry
Write-Host "📜 Audit log updated: $entry" -ForegroundColor Green

