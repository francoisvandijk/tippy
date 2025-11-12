# Create Doppler PR and add governance comment
# Run this after: winget install --id GitHub.cli -e && gh auth login

$prBody = "Adds Doppler CI workflow, runbook, rotation policy, and env verification. No secrets included. See ops/doppler/README.md for operator steps."

Write-Host "Creating draft PR..." -ForegroundColor Cyan
$pr = gh pr create --base main --head infra/doppler-setup `
  --title "Doppler Secrets Management Setup - Draft (§25)" `
  --body $prBody `
  --draft

if ($LASTEXITCODE -ne 0) {
    Write-Host "PR creation failed. Use manual link:" -ForegroundColor Red
    Write-Host "https://github.com/francoisvandijk/tippy/compare/main...infra/doppler-setup" -ForegroundColor Yellow
    exit 1
}

Write-Host "PR created: $pr" -ForegroundColor Green
$prNumber = ($pr -split '/')[-1]

$gov = @"
**§25 Governance Review — Doppler Setup**

- Files:  
  - `.github/workflows/ci-doppler.yml`  
  - `scripts/print-env-check.js`  
  - `ops/doppler/rotation_policy.json`  
  - `ops/doppler/README.md`  
  - `ops/doppler/bootstrap.ps1`

- Secrets: None included (verified).

- CI requires `DOPPLER_TOKEN_CI` in GitHub Actions Secrets.

**Operator Actions**

1. Run `ops/doppler/bootstrap.ps1` with your `DOPPLER_SERVICE_TOKEN_ADMIN` to create project/envs.

2. Add CI read-only token to GitHub → Settings → Secrets → Actions → **DOPPLER_TOKEN_CI**.

3. Set required keys (placeholders fine for CI).

4. Re-run CI on PR → expect "Env check: PASS (values not printed)".

5. Before importing prod secrets, open Issue **§25: Approve Production Secrets Import** and assign Compliance Officer.

**Status:** Awaiting operator bootstrap and compliance review.
"@

Write-Host "Adding governance comment..." -ForegroundColor Cyan
gh pr comment $prNumber --body $gov

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ PR created and governance comment added!" -ForegroundColor Green
    Write-Host "PR URL: $pr" -ForegroundColor Cyan
} else {
    Write-Host "PR created but comment failed. Add manually via GitHub UI." -ForegroundColor Yellow
    Write-Host "PR URL: $pr" -ForegroundColor Cyan
}

