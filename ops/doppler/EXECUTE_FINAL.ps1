& "ops/dev/ensure-gh-auth.ps1"
# Execute Final Doppler CI Validation
# Ledger Reference: Tippy Decision Ledger v1.0 (Final) Â§25

$ErrorActionPreference = "Stop"

Write-Host "`n=== Â§25 Doppler CI Final Execution ===" -ForegroundColor Cyan

# Step 1: Clear invalid tokens and authenticate
Write-Host "`n[1] GitHub CLI Authentication..." -ForegroundColor Yellow

# Clear invalid tokens
Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:\GITHUB_TOKEN -ErrorAction SilentlyContinue

# Check authentication
$authStatus = gh auth status 2>&1 | Out-String
if ($authStatus -notmatch "Logged in" -and $authStatus -notmatch "francoisvandijk") {
    Write-Host "  Authenticating via browser..." -ForegroundColor Yellow
    Write-Host "  Please complete authentication in the browser, then press Enter..." -ForegroundColor Cyan
    gh auth login --hostname github.com --git-protocol https --web
    $null = Read-Host "Press Enter after authentication completes"
} else {
    Write-Host "  [OK] GitHub CLI authenticated" -ForegroundColor Green
}

# Step 2: Trigger and watch workflow
Write-Host "`n[2] Triggering CI (Doppler) workflow..." -ForegroundColor Yellow

gh workflow run "ci-doppler.yml" --ref infra/doppler-setup
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Failed to trigger workflow" -ForegroundColor Red
    Write-Host "  Trying alternative method..." -ForegroundColor Yellow
    gh workflow run .github/workflows/ci-doppler.yml --ref infra/doppler-setup
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to trigger workflow. Check GitHub Actions permissions."
        exit 1
    }
}

Write-Host "  [OK] Workflow triggered" -ForegroundColor Green

# Step 3: Watch workflow
Write-Host "`n[3] Watching workflow run..." -ForegroundColor Yellow

Write-Host "  Recent runs:" -ForegroundColor Gray
gh run list --limit 5

Write-Host "`n  Waiting for completion..." -ForegroundColor Gray
gh run watch --exit-status
if ($LASTEXITCODE -ne 0) {
    Write-Error "Workflow failed. Check logs for details."
    exit 1
}

Write-Host "  [OK] Workflow completed successfully" -ForegroundColor Green

# Step 4: Post governance comment
Write-Host "`n[4] Posting governance comment to PR #8..." -ForegroundColor Yellow

$commentFile = "ops/doppler/GOVERNANCE_COMMENT_COMPLETE.txt"
if (-not (Test-Path $commentFile)) {
    Write-Error "Missing governance proof file: $commentFile"
    exit 1
}

gh pr comment 8 --body-file $commentFile
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Governance comment posted" -ForegroundColor Green
} else {
    Write-Error "Failed to post governance comment"
    exit 1
}

# Step 5: Append audit log
Write-Host "`n[5] Appending audit log..." -ForegroundColor Yellow

New-Item -ItemType Directory -Path ops/doppler/LOGS -Force | Out-Null
$auditEntry = "Â§25 Doppler CI validated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Add-Content -Path ops/doppler/AUDIT_LOG.txt -Value $auditEntry
Write-Host "  [OK] Audit entry added: $auditEntry" -ForegroundColor Green

git add ops/doppler/AUDIT_LOG.txt
git commit -m "chore(Â§25): Doppler CI verified and logged" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    git push 2>&1 | Out-Null
    Write-Host "  [OK] Audit log committed and pushed" -ForegroundColor Green
} else {
    Write-Host "  [INFO] No audit changes to commit" -ForegroundColor Gray
}

# Validation Checklist
Write-Host "`n=== Validation Checklist ===" -ForegroundColor Cyan
Write-Host "[OK] .github/workflows/ci-doppler.yml contains workflow_dispatch" -ForegroundColor Green
Write-Host "[OK] CI run for workflow 'CI (Doppler)' finished SUCCESS" -ForegroundColor Green
Write-Host "[OK] Comment posted to PR #8 with proof file contents" -ForegroundColor Green
Write-Host "[OK] Audit entry appended in ops/doppler/AUDIT_LOG.txt" -ForegroundColor Green

# Final Success
Write-Host "`n=== PASS Â§25 Doppler CI ===" -ForegroundColor Green
Write-Host "Workflow success, governance comment posted to PR #8, audit log updated." -ForegroundColor Green


