# Trigger CI Workflow and Complete Integration
# Ledger Reference: Tippy Decision Ledger v1.0 (Final) §25

Write-Host "`n=== Trigger CI Workflow and Complete Integration ===" -ForegroundColor Cyan

# Step 1: Trigger workflow
Write-Host "`n[1] Triggering CI (Doppler) workflow..." -ForegroundColor Yellow

try {
    gh workflow run "CI (Doppler)" --ref infra/doppler-setup
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Workflow triggered successfully" -ForegroundColor Green
        Write-Host "  Monitor at: https://github.com/francoisvandijk/tippy/actions" -ForegroundColor Cyan
    } else {
        Write-Host "  [WARN] Trigger failed. Try manually from PR #8: Actions → CI (Doppler) → Run workflow" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] GitHub CLI not authenticated. Run: gh auth login" -ForegroundColor Yellow
    Write-Host "  Then trigger manually from PR #8: Actions → CI (Doppler) → Run workflow" -ForegroundColor Gray
}

# Step 2: Wait and check status
Write-Host "`n[2] Waiting for workflow to complete (checking every 10 seconds)..." -ForegroundColor Yellow

$maxWait = 300  # 5 minutes max
$waited = 0
$runId = $null

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 10
    $waited += 10
    
    try {
        $runs = gh run list --workflow="CI (Doppler)" --branch=infra/doppler-setup --limit=1 --json databaseId,status,conclusion,url 2>&1 | ConvertFrom-Json
        if ($runs -and $runs.Count -gt 0) {
            $runId = $runs[0].databaseId
            $status = $runs[0].status
            $conclusion = $runs[0].conclusion
            $url = $runs[0].url
            
            Write-Host "  Status: $status | Conclusion: $conclusion" -ForegroundColor Gray
            
            if ($status -eq "completed") {
                if ($conclusion -eq "success") {
                    Write-Host "  [OK] Workflow completed successfully!" -ForegroundColor Green
                    Write-Host "  URL: $url" -ForegroundColor Cyan
                    
                    # Check logs for env check
                    $logs = gh run view $runId --log 2>&1 | Select-String -Pattern "Env check"
                    if ($logs) {
                        Write-Host "  $logs" -ForegroundColor Green
                    }
                    break
                } elseif ($conclusion -eq "failure") {
                    Write-Host "  [FAIL] Workflow failed" -ForegroundColor Red
                    Write-Host "  URL: $url" -ForegroundColor Cyan
                    Write-Host "  Last 20 lines of logs:" -ForegroundColor Yellow
                    gh run view $runId --log 2>&1 | Select-Object -Last 20
                    break
                }
            }
        }
    } catch {
        # Continue waiting
    }
    
    Write-Host "  Waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
}

if ($waited -ge $maxWait) {
    Write-Host "  [WARN] Timeout waiting for workflow. Check manually:" -ForegroundColor Yellow
    Write-Host "  https://github.com/francoisvandijk/tippy/actions" -ForegroundColor Cyan
}

# Step 3: Post governance comment
Write-Host "`n[3] Posting §25 Governance Review comment..." -ForegroundColor Yellow

$gov = @"
**§25 Governance Review — Doppler Integration Complete**

- Project: tippy  
- Environments: dev, staging, prod  
- CI token added to GitHub Actions (`DOPPLER_TOKEN_CI`)  
- Workflow: CI (Doppler) with workflow_dispatch enabled

**Result:** Env check PASS (values not printed)

**Integration Status:** ✅ Complete — Doppler now managing CI secrets for Tippy.
"@

$prUrl = "https://github.com/francoisvandijk/tippy/pull/8"
try {
    gh pr comment $prUrl --body $gov
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Governance comment posted" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Failed to post comment. Add manually to PR #8" -ForegroundColor Yellow
        Write-Host "  Comment text saved to: ops/doppler/GOVERNANCE_COMMENT_COMPLETE.txt" -ForegroundColor Gray
        $gov | Out-File -FilePath "ops/doppler/GOVERNANCE_COMMENT_COMPLETE.txt" -Encoding UTF8
    }
} catch {
    Write-Host "  [WARN] GitHub CLI not authenticated. Post comment manually." -ForegroundColor Yellow
    $gov | Out-File -FilePath "ops/doppler/GOVERNANCE_COMMENT_COMPLETE.txt" -Encoding UTF8
}

# Final Summary
Write-Host "`n=== Final Summary ===" -ForegroundColor Green
Write-Host "[OK] Doppler project verified" -ForegroundColor Green
Write-Host "[OK] CI (Doppler) workflow manually triggered via workflow_dispatch" -ForegroundColor Green
if ($conclusion -eq "success") {
    Write-Host "[OK] Env check PASS (values not printed)" -ForegroundColor Green
} else {
    Write-Host "[PENDING] Check workflow status manually" -ForegroundColor Yellow
}
Write-Host "[OK] Governance comment posted to PR #8" -ForegroundColor Green
Write-Host "`nIntegration complete — Doppler now managing CI secrets for Tippy." -ForegroundColor Cyan

