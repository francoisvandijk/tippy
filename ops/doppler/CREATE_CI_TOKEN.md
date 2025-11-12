# Create CI Read-Only Service Token

## Option 1: Via Doppler Dashboard (Recommended)

1. Go to: https://dashboard.doppler.com
2. Navigate to: **Workplace** → **tippy** → **Access** → **Service Tokens**
3. Click **Create Service Token**
4. Configure:
   - **Name**: `ci-token`
   - **Role**: `Read Only`
   - **Environments**: Select `development` and `staging` only
   - **Project**: `tippy`
5. Click **Create**
6. **Copy the token immediately** (it won't be shown again)

## Option 2: Via Doppler CLI (if supported)

```bash
doppler service-tokens create --name "ci-token" --role read_only --environments development,staging --project tippy
```

## Next Step

After creating the token, add it to GitHub Actions:
- Go to: https://github.com/francoisvandijk/tippy/settings/secrets/actions
- Click **New repository secret**
- Name: `DOPPLER_TOKEN_CI`
- Value: `[paste the token you just created]`
- Click **Add secret**


