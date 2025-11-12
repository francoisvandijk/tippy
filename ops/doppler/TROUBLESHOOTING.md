# Troubleshooting Doppler CI Integration

## Issue: HTTP 422 - Workflow does not have 'workflow_dispatch' trigger

**Cause**: The workflow file on the remote branch doesn't have `workflow_dispatch` enabled.

**Solution**:
1. Verify local workflow has `workflow_dispatch`:
   ```powershell
   Get-Content .github/workflows/ci-doppler.yml | Select-String "workflow_dispatch"
   ```

2. If missing, add it:
   ```yaml
   on:
     workflow_dispatch:
     push:
     pull_request:
   ```

3. Commit and push:
   ```powershell
   git add .github/workflows/ci-doppler.yml
   git commit -m "ci: ensure workflow_dispatch for Doppler CI"
   git push origin infra/doppler-setup
   ```

4. Wait a few seconds for GitHub to update, then retry.

## Issue: HTTP 401 - Bad credentials (GH_TOKEN)

**Cause**: The GH_TOKEN stored in Doppler is invalid, expired, or lacks required scopes.

**Solution**:
1. Create a new GitHub Classic PAT:
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `workflow`
   - If your org requires SSO, authorize the token for your organization
   - Copy the token

2. Update in Doppler:
   ```powershell
   doppler secrets set GH_TOKEN --project tippy --config dev
   # Paste the token when prompted
   ```

3. Verify:
   ```powershell
   doppler run --project tippy --config dev -- gh auth status
   ```

## Issue: Actions are disabled

**Solution**:
1. Go to: https://github.com/francoisvandijk/tippy/settings/actions
2. Under "Workflow permissions", select "Read and write permissions"
3. Under "Allow actions and reusable workflows", select "Allow all actions"

## Verification Steps

After fixing issues, verify:
1. Workflow file has `workflow_dispatch` (local and remote)
2. GH_TOKEN is valid and has correct scopes
3. GitHub Actions are enabled for the repository
4. Run: `powershell -ExecutionPolicy Bypass -File ops/doppler/EXECUTE_FINAL.ps1`

