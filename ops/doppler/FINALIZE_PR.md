# Finalize Doppler PR Creation

## Option 1: Using GitHub CLI (Recommended)

If `gh` is installed and authenticated:

```powershell
$prBody = "Adds Doppler CI workflow, runbook, rotation policy, and environment verification. No secrets included. See ops/doppler/README.md for operator steps."

gh pr create --base main --head infra/doppler-setup `
  --title "Doppler Secrets Management Setup - Draft (§25)" `
  --body $prBody `
  --draft
```

Then add the governance comment:

```powershell
$gov = @"
**§25 Governance Review — Doppler Setup**

- Files: `.github/workflows/ci-doppler.yml`, `ops/doppler/README.md`, `ops/doppler/rotation_policy.json`, `scripts/print-env-check.js`, `ops/doppler/bootstrap.ps1`

- Secrets: None included (verified).

- CI requires `DOPPLER_TOKEN_CI` to be added to GitHub Actions Secrets.

**Operator Actions**

1. Run `ops/doppler/bootstrap.ps1` to create the Doppler project/envs and CI token.

2. Add token to GitHub → Settings → Secrets and variables → Actions → `DOPPLER_TOKEN_CI`.

3. Set required keys (placeholders fine for CI).

4. Re-run CI on the PR — expect "Env check: PASS (values not printed)".

5. For production: open an Issue titled "§25: Approve Production Secrets Import" and obtain Compliance Officer sign-off before importing any prod values.

**Status:** Awaiting operator bootstrap and compliance review.
"@

gh pr comment [PR_NUMBER] --body $gov
```

## Option 2: Via GitHub Web UI

1. Visit: https://github.com/francoisvandijk/tippy/compare/main...infra/doppler-setup
2. Click "Create pull request"
3. Title: `Doppler Secrets Management Setup - Draft (§25)`
4. Body: `Adds Doppler CI workflow, runbook, rotation policy, and environment verification. No secrets included. See ops/doppler/README.md for operator steps.`
5. Mark as **Draft**
6. Click "Create pull request"

Then add the governance comment manually (copy from above).

## Option 3: Install GitHub CLI First

If `gh` is not installed:

```powershell
winget install --id GitHub.cli -e
gh auth login
```

Then proceed with Option 1.

