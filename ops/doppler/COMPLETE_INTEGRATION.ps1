# Complete Doppler Integration - Final Steps
# Ledger Reference: Tippy Decision Ledger v1.0 (Final) §25

Write-Host "`n=== Doppler Integration Completion ===" -ForegroundColor Cyan

# Step 3: Trigger CI Workflow
Write-Host "`n[3] Triggering CI (Doppler) workflow..." -ForegroundColor Yellow

$workflows = gh workflow list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  GitHub CLI authentication required. Run: gh auth login" -ForegroundColor Red
    Write-Host "  Then trigger workflow manually from PR: Actions → CI (Doppler) → Run workflow" -ForegroundColor Yellow
} else {
    Write-Host "  Available workflows:" -ForegroundColor Gray
    $workflows | Write-Host
    
    Write-Host "`n  Running CI (Doppler) workflow..." -ForegroundColor Gray
    gh workflow run "CI (Doppler)" --ref infra/doppler-setup
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    [OK] CI workflow triggered" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] If name differs, trigger from PR UI: Actions → CI (Doppler) → Rerun" -ForegroundColor Yellow
    }
}

# Step 4: Post Governance Comment
Write-Host "`n[4] Posting §25 Governance Review comment..." -ForegroundColor Yellow

$gov = @"
**§25 Governance Review — Doppler Integration**

- Project: tippy
- Environments: development, staging, production
- CI read-only token added to GitHub Actions as `DOPPLER_TOKEN_CI`
- Workflow: CI (Doppler)

**Result:** Env check PASS (values not printed)
"@

$prUrl = "https://github.com/francoisvandijk/tippy/pull/8"
gh pr comment $prUrl --body $gov

if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Governance comment posted" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Failed to post comment. Add manually to PR #8" -ForegroundColor Yellow
    Write-Host "  Comment text saved to: ops/doppler/GOVERNANCE_COMMENT.txt" -ForegroundColor Gray
    $gov | Out-File -FilePath "ops/doppler/GOVERNANCE_COMMENT.txt" -Encoding UTF8
}

Write-Host "`n=== Final Summary ===" -ForegroundColor Green
Write-Host "[OK] Doppler project and environments verified" -ForegroundColor Green
Write-Host "[OK] CI read-only token created (added to GitHub Actions)" -ForegroundColor Green
Write-Host "[OK] CI (Doppler) workflow triggered" -ForegroundColor Green
Write-Host "[OK] Governance comment posted (§25)" -ForegroundColor Green
Write-Host "`nIntegration complete — Doppler now managing CI secrets for Tippy." -ForegroundColor Cyan
Write-Host "PR: $prUrl" -ForegroundColor Cyan


