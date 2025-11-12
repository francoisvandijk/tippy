# CI Trigger Guidance

After adding `DOPPLER_TOKEN_CI` to GitHub Actions secrets:

## Option 1: Re-run via GitHub UI
- Go to PR → Actions tab
- Click "Re-run jobs" on the failed workflow run

## Option 2: Trigger via GitHub CLI
```powershell
# List available workflows
gh workflow list

# Run the workflow
gh workflow run "CI (Doppler)" --ref infra/doppler-setup
```

