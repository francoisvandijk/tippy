# Finish Doppler Setup - Complete Workflow
# Ledger Reference: Tippy Decision Ledger v1.0 (Final) §25

$ErrorActionPreference = "Stop"

Write-Host "`n=== Doppler Setup Completion ===" -ForegroundColor Cyan

# 0) Preflight
Write-Host "`n[0] Preflight checks..." -ForegroundColor Yellow

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
    Write-Error "Not in a git repository"
    exit 1
}

git fetch --all | Out-Null
git checkout -B infra/doppler-setup | Out-Null

# Check GitHub CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "GitHub CLI (gh) not found. Install with:" -ForegroundColor Red
    Write-Host "  winget install --id GitHub.cli -e" -ForegroundColor Cyan
    Write-Host "  gh auth login" -ForegroundColor Cyan
    exit 1
}

# Check gh authentication
$ghAuth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub CLI not authenticated. Run:" -ForegroundColor Yellow
    Write-Host "  gh auth login" -ForegroundColor Cyan
    exit 1
}

Write-Host "  ✓ Git repository" -ForegroundColor Green
Write-Host "  ✓ GitHub CLI available" -ForegroundColor Green
Write-Host "  ✓ GitHub CLI authenticated" -ForegroundColor Green

# 1) Open Draft PR (idempotent)
Write-Host "`n[1] Creating/checking Draft PR..." -ForegroundColor Yellow

$prTitle = "Doppler Secrets Management Setup - Draft (§25)"
$prBody = "Adds Doppler CI workflow, runbook, rotation policy, bootstrap, and env verification. No secrets included. See ops/doppler/README.md."

$existing = gh pr list --head infra/doppler-setup --json url --jq ".[0].url" 2>$null
if ($existing) {
    Write-Host "  PR already exists: $existing" -ForegroundColor Green
    $prUrl = $existing
} else {
    $prUrl = gh pr create --base main --head infra/doppler-setup --title $prTitle --body $prBody --draft
    Write-Host "  PR created: $prUrl" -ForegroundColor Green
}

# 2) Bootstrap Doppler
Write-Host "`n[2] Bootstrap Doppler project/environments..." -ForegroundColor Yellow

# Ensure Doppler CLI is available
if (-not (Get-Command doppler -ErrorAction SilentlyContinue)) {
    Write-Host "  Installing Doppler CLI..." -ForegroundColor Yellow
    Invoke-WebRequest -UseBasicParsing https://cli.doppler.com/install.sh -OutFile doppler-install.sh
    bash doppler-install.sh
    Remove-Item doppler-install.sh -ErrorAction SilentlyContinue
}

Write-Host "`n  == Doppler login required ==" -ForegroundColor Yellow
Write-Host "  In the terminal, run: doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>" -ForegroundColor Cyan
Write-Host "  Do NOT paste the token here in chat. After login, press Enter to continue..." -ForegroundColor Yellow
$null = Read-Host

# Create project & envs (idempotent)
Write-Host "  Creating project 'tippy'..." -ForegroundColor Gray
doppler projects create tippy 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    (project may already exist)" -ForegroundColor Gray
} else {
    Write-Host "    ✓ Project created" -ForegroundColor Green
}

foreach ($env in @("development","staging","production")) {
    Write-Host "  Creating environment '$env'..." -ForegroundColor Gray
    doppler environments create $env --project tippy 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ($env may already exist)" -ForegroundColor Gray
    } else {
        Write-Host "    ✓ Environment '$env' created" -ForegroundColor Green
    }
}

Write-Host "`n  Creating CI read-only service token (dev+staging)..." -ForegroundColor Yellow
Write-Host "  (Token will be displayed in terminal - copy it now)" -ForegroundColor Yellow
doppler service-token create --name "ci-token" --role read_only --environments development,staging --project tippy
Write-Host "`n  Copy the token value shown above. Next step will ask you to add it to GitHub as DOPPLER_TOKEN_CI." -ForegroundColor Yellow

# 3) Add CI token to GitHub Actions
Write-Host "`n[3] Add CI token to GitHub Actions..." -ForegroundColor Yellow
Write-Host "  Open GitHub → Settings → Secrets and variables → Actions → New repository secret" -ForegroundColor Cyan
Write-Host "  Name: DOPPLER_TOKEN_CI" -ForegroundColor Cyan
Write-Host "  Value: <paste the CI token you just created>" -ForegroundColor Cyan
Write-Host "  Press Enter once you've added the secret..." -ForegroundColor Yellow
$null = Read-Host

# 4) Trigger CI
Write-Host "`n[4] Triggering CI (Doppler) workflow..." -ForegroundColor Yellow

Write-Host "  Available workflows:" -ForegroundColor Gray
gh workflow list

Write-Host "`n  Running 'CI (Doppler)' workflow..." -ForegroundColor Gray
try {
    gh workflow run "CI (Doppler)" --ref infra/doppler-setup
    Write-Host "    ✓ CI workflow triggered" -ForegroundColor Green
} catch {
    Write-Host "    ⚠ If the name differs, trigger from the PR UI: Actions → CI (Doppler) → Rerun." -ForegroundColor Yellow
}

Write-Host "`n  When the run finishes, expect to see: 'Env check: PASS (values not printed)'." -ForegroundColor Cyan
Write-Host "  PR URL: $prUrl" -ForegroundColor Cyan

# 5) Add Governance comment
Write-Host "`n[5] Adding §25 Governance comment to PR..." -ForegroundColor Yellow

$gov = @"
**§25 Governance Review — Doppler Setup**

- Files: .github/workflows/ci-doppler.yml, scripts/print-env-check.js, ops/doppler/rotation_policy.json, ops/doppler/README.md, ops/doppler/bootstrap.ps1

- Secrets: None committed. CI requires DOPPLER_TOKEN_CI (added in repo Actions secrets).

**Operator steps completed so far**

1) Doppler project/envs created

2) CI read-only token created and stored in GitHub Actions as DOPPLER_TOKEN_CI

3) CI triggered — expecting 'Env check: PASS (values not printed)'

**Before production import**

Open Issue: "§25: Approve Production Secrets Import", assign Compliance Officer, and import prod values only after approval. Audit logs must show import metadata; rotate admin tokens within 72h post-import.
"@

gh pr comment $prUrl --body $gov
Write-Host "  ✓ Governance comment added" -ForegroundColor Green

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "PR: $prUrl" -ForegroundColor Cyan
Write-Host "`nNext: Monitor CI run and verify 'Env check: PASS (values not printed)' appears." -ForegroundColor Yellow

