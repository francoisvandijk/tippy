# Complete Doppler Setup - Next Steps

## Current Status

✅ All Doppler integration files committed to `infra/doppler-setup`  
✅ Setup completion script created: `ops/doppler/FINISH_DOPPLER.ps1`  
⚠️ GitHub CLI authentication required

## To Complete Setup

### Step 1: Authenticate GitHub CLI

```powershell
gh auth login
```

Follow the prompts to authenticate in your browser.

### Step 2: Run Completion Script

```powershell
powershell -ExecutionPolicy Bypass -File ops/doppler/FINISH_DOPPLER.ps1
```

This script will:

1. **Create/check Draft PR** - Creates PR titled "Doppler Secrets Management Setup - Draft (§25)"
2. **Bootstrap Doppler** - Prompts you to login with `DOPPLER_SERVICE_TOKEN_ADMIN`, then creates:
   - Project: `tippy`
   - Environments: `development`, `staging`, `production`
   - CI read-only token: `ci-token` (for dev/staging)
3. **Add CI Token to GitHub** - Prompts you to add the token as `DOPPLER_TOKEN_CI` in GitHub Actions secrets
4. **Trigger CI** - Runs the "CI (Doppler)" workflow on the PR
5. **Add Governance Comment** - Posts §25 governance review comment to the PR

### Expected Results

After running the script:

- ✅ Draft PR exists with governance comment
- ✅ Doppler project + environments created
- ✅ CI read-only token stored as `DOPPLER_TOKEN_CI` in GitHub Actions
- ✅ CI run passes with: "Env check: PASS (values not printed)"

## Manual Alternative

If you prefer to run steps manually:

1. **Create PR**: https://github.com/francoisvandijk/tippy/compare/main...infra/doppler-setup
2. **Bootstrap Doppler**: Run `ops/doppler/bootstrap.ps1` and follow prompts
3. **Add CI Token**: GitHub → Settings → Secrets → Actions → `DOPPLER_TOKEN_CI`
4. **Trigger CI**: PR → Actions tab → Run workflow
5. **Add Comment**: Copy from `ops/doppler/GOVERNANCE_COMMENT_BODY.md`

## Important Notes

- **Never paste tokens in chat** - All token operations happen locally
- **CI token is shown once** - Copy it immediately when created
- **Production secrets require approval** - Open issue "§25: Approve Production Secrets Import" before importing prod values



