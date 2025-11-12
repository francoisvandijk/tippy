# Doppler Secrets Management Runbook for Tippy

**Ledger Reference**: Tippy Decision Ledger v1.0 (Final), § 25 — Environment, Credentials & Secrets Management (Locked)  
**Last Updated**: 2025-01-27  
**Owner**: DevOps Team (devops@mentenova.co.za)

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Secret Management](#secret-management)
5. [CI/CD Integration](#cicd-integration)
6. [Runtime Integration](#runtime-integration)
7. [Rotation & Maintenance](#rotation--maintenance)
8. [Auditing](#auditing)
9. [Emergency Procedures](#emergency-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This runbook describes how to securely manage runtime secrets for the Tippy application using Doppler. All secrets are stored in Doppler and injected at runtime via environment variables. **No plaintext secrets are ever committed to the repository.**

### Key Principles (per § 25)

- ✅ All secrets stored in Doppler (no plaintext in repo)
- ✅ Least-privilege service tokens
- ✅ Audit logging enabled
- ✅ Rotation policy enforced
- ✅ POPIA compliance (MSISDN hashing)
- ❌ Never log or print secret values
- ❌ Never commit secrets to repository

---

## Prerequisites

### Required Access

1. **Doppler Account**: Access to Doppler dashboard (https://dashboard.doppler.com)
2. **GitHub Repository Admin**: Access to `francoisvandijk/tippy` repository settings
3. **Doppler Admin Token**: Service token with permissions to create projects/environments/secrets

### Required Tools

- Doppler CLI (installed via setup script)
- PowerShell (for Windows) or Bash (for Linux/Mac)
- Node.js (for runtime verification)

---

## Initial Setup

### Step 1: Obtain Doppler Admin Token

**⚠️ CRITICAL**: Use an out-of-band secure channel to obtain the admin token. See `SECURE_TOKEN_REQUEST.md` for detailed instructions.

**Do NOT** accept tokens via chat, email, or unencrypted channels.

### Step 2: Run Setup Script

```powershell
# Set admin token (from secure channel)
$env:DOPPLER_SERVICE_TOKEN_ADMIN = "dp.st.xxxxx"

# Run setup script
.\ops\doppler\setup-doppler.ps1 -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN
```

This script will:
- ✅ Install Doppler CLI (if missing)
- ✅ Validate admin access
- ✅ Create project `tippy` (if missing)
- ✅ Create environments: `development`, `staging`, `production`

### Step 3: Create Service Tokens

```powershell
.\ops\doppler\create-service-tokens.ps1 -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN
```

This creates two service tokens:

1. **`ci-token`** (read-only, dev/staging)
   - **Action Required**: Add to GitHub repository secret `DOPPLER_TOKEN_CI`
   - Go to: https://github.com/francoisvandijk/tippy/settings/secrets/actions
   - Click "New repository secret"
   - Name: `DOPPLER_TOKEN_CI`
   - Value: `[paste ci-token value]`

2. **`deploy-token`** (deploy role, production)
   - **Action Required**: Store in secure deployment tooling (not in repo)
   - Do NOT commit to repository

**⚠️ IMPORTANT**: Store token values securely. They will not be shown again.

### Step 4: Verify Setup

```powershell
.\ops\doppler\verify-access.ps1 -DopplerToken $env:DOPPLER_SERVICE_TOKEN_ADMIN -Environment development
```

Expected output:
```
✓ All verification tests completed!
```

---

## Secret Management

### Secret Key Naming Convention

All runtime secrets use the `TIPPY_` prefix and `snake_case`:

- `TIPPY_DB_URL`
- `TIPPY_DB_PASSWORD`
- `TIPPY_YOCO_API_KEY`
- `TIPPY_SENDGRID_API_KEY`
- `TIPPY_TWILIO_API_KEY`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `SENTRY_DSN`

### Importing Secrets

#### Option 1: Encrypted File Import (Recommended)

1. **Create secrets file** (use `secrets-template.json` as template)
2. **Encrypt the file** using PGP or age:
   ```bash
   # PGP example
   gpg --encrypt --recipient devops@mentenova.co.za secrets.json
   
   # age example
   age -r age1xxxxx -o secrets.json.age secrets.json
   ```
3. **Upload encrypted file** via secure channel (SFTP, signed URL, etc.)
4. **Decrypt and import**:
   ```powershell
   # Decrypt
   gpg --decrypt secrets.json.gpg > secrets.json
   
   # Import
   .\ops\doppler\import-secrets-template.ps1 `
     -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN `
     -Environment development `
     -SecretsFile secrets.json
   
   # File is automatically deleted after import
   ```

#### Option 2: Interactive Import

```powershell
.\ops\doppler\import-secrets-template.ps1 `
  -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN `
  -Environment development
```

**⚠️ For Production**: Interactive import requires explicit approval. Type `APPROVED` when prompted.

### POPIA Compliance: MSISDN Handling

Per § 25, phone numbers (MSISDN) must be:

1. **Hashed** (SHA256) before storage
2. **Only last4 digits** may be stored in masked audit exports

If you need to store MSISDN-related secrets:
- Transform during ingestion: `SHA256(msisdn)` → store hash
- For audit exports: `last4(msisdn)` → store last 4 digits only

---

## CI/CD Integration

### GitHub Actions

The workflow file `.github/workflows/ci-doppler.yml` is already configured. It:

1. Installs Doppler CLI
2. Logs in using `DOPPLER_TOKEN_CI` secret
3. Runs tests with Doppler-injected environment variables
4. Masks secrets in logs

### Adding the CI Token to GitHub

1. Go to: https://github.com/francoisvandijk/tippy/settings/secrets/actions
2. Click **New repository secret**
3. Name: `DOPPLER_TOKEN_CI`
4. Value: `[paste ci-token value from Step 3]`
5. Click **Add secret**

**⚠️ DO NOT** add the token in PR comments or commit messages.

### Testing CI Integration

Push a commit to trigger the workflow:

```bash
git commit --allow-empty -m "test: verify Doppler CI integration"
git push
```

Check the workflow run: https://github.com/francoisvandijk/tippy/actions

---

## Runtime Integration

### Docker

Use the provided `docker-entrypoint.sh`:

```dockerfile
# See ops/doppler/Dockerfile.example
COPY ops/doppler/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/doppler-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/doppler-entrypoint.sh"]
```

**Required environment variables**:
- `DOPPLER_TOKEN`: Service token (set at deploy time)
- `DOPPLER_ENVIRONMENT`: One of `development`, `staging`, `production`

### Kubernetes

See `ops/doppler/kubernetes-secret-example.yaml` for examples:

1. **Init Container Pattern**: Use Doppler CLI in init container to fetch secrets
2. **Doppler Kubernetes Operator** (recommended): Use official operator for sidecar injection

**⚠️ Do NOT** create Kubernetes secrets with plaintext values unless absolutely necessary.

### Local Development

```bash
# Set service token
export DOPPLER_TOKEN="dp.st.xxxxx"

# Run application with Doppler
doppler run --doppler-config=development -- npm start
```

---

## Rotation & Maintenance

### Rotation Policy

See `ops/doppler/rotation_policy.json`:

- **Standard secrets**: Rotate every 90 days
- **Critical secrets**: Rotate every 30 days
  - `TIPPY_DB_PASSWORD`
  - `TIPPY_YOCO_API_KEY`
  - `TIPPY_SENDGRID_API_KEY`
  - `TIPPY_TWILIO_API_KEY`
  - `GITHUB_OAUTH_CLIENT_SECRET`

### Rotating a Secret

1. **Generate new value** (via service provider)
2. **Update in Doppler**:
   ```powershell
   doppler secrets set TIPPY_DB_PASSWORD="new_password" `
     --project tippy `
     --config production `
     --token $env:DOPPLER_SERVICE_TOKEN_ADMIN
   ```
3. **Verify** application can access new value
4. **Revoke old value** (if applicable)
5. **Update rotation log** (internal tracking)

### Automated Rotation Reminders

A GitHub Actions workflow (or external cron) should surface secrets older than `rotation_period_days`. This is metadata-only (no secret values).

---

## Auditing

### Viewing Audit Logs

1. Go to Doppler Dashboard: https://dashboard.doppler.com
2. Navigate to: **Workplace** → **tippy** → **Environments** → **[environment]** → **Audit**
3. Filter by:
   - Date range
   - Actor (user/service token)
   - Action (create, update, delete, read)

### Audit Log Retention

- **Retention period**: 365 days (per `rotation_policy.json`)
- **Export format**: Metadata only (no secret values)
- **POPIA compliance**: MSISDN values masked (last4 only)

### Example Audit Query (Metadata Only)

```json
{
  "events": [
    {
      "actor": "alice@mentenova.co.za",
      "action": "create_secret",
      "key": "TIPPY_DB_URL",
      "time": "2025-01-27T09:00:00Z",
      "environment": "development"
    }
  ]
}
```

---

## Emergency Procedures

### Revoking a Compromised Token

1. **Identify the token** (via audit logs or service token list)
2. **Run revocation script**:
   ```bash
   export DOPPLER_SERVICE_TOKEN_ADMIN="dp.st.xxxxx"
   ./ops/doppler/emergency_revoke.sh <token-id>
   ```
3. **Type `REVOKE`** to confirm
4. **Create replacement token** (if needed)
5. **Update CI/CD or deployment tooling** with new token
6. **Document incident** (internal security log)

### Rotating All Secrets (Breach Scenario)

1. **Revoke all service tokens** (via emergency script)
2. **Generate new values** for all secrets
3. **Re-import secrets** (via import script)
4. **Create new service tokens**
5. **Update CI/CD and deployment tooling**
6. **Verify application functionality**
7. **Document incident and remediation**

---

## Troubleshooting

### "Authentication failed" Error

**Cause**: Invalid or expired token

**Solution**:
1. Verify token is correct (check for typos)
2. Check token expiration in Doppler dashboard
3. Create new token if expired

### "Failed to access Doppler secrets" Error

**Cause**: Insufficient permissions or wrong environment

**Solution**:
1. Verify token has access to project/environment
2. Check token role (read_only vs deploy vs admin)
3. Verify project name and environment name are correct

### Secrets Not Available at Runtime

**Cause**: Doppler not configured or token not set

**Solution**:
1. Verify `DOPPLER_TOKEN` environment variable is set
2. Verify `DOPPLER_ENVIRONMENT` is set correctly
3. Check entrypoint script is executing Doppler login
4. Verify service token has access to target environment

### CI Workflow Fails

**Cause**: Missing `DOPPLER_TOKEN_CI` secret in GitHub

**Solution**:
1. Go to repository settings → Secrets → Actions
2. Verify `DOPPLER_TOKEN_CI` exists
3. Re-create if missing (use ci-token value)

---

## Manual Sign-Off Checklist

Before deploying to production, complete this checklist:

### Pre-Production

- [ ] Doppler project `tippy` created
- [ ] Environments `development`, `staging`, `production` created
- [ ] Service tokens created (`ci-token`, `deploy-token`)
- [ ] `DOPPLER_TOKEN_CI` added to GitHub repository secrets
- [ ] Development secrets imported and verified
- [ ] Staging secrets imported and verified
- [ ] CI workflow tested and passing
- [ ] Runtime integration tested (Docker/Kubernetes)

### Production Deployment

- [ ] **Explicit approval** obtained for production secret import
- [ ] Production secrets imported (via approved method)
- [ ] Production secrets verified (no placeholders)
- [ ] `deploy-token` stored in secure deployment tooling
- [ ] Audit logs enabled and accessible
- [ ] Rotation policy documented and scheduled
- [ ] Emergency procedures documented and tested
- [ ] Team trained on secret management procedures

### Compliance

- [ ] § 25 requirements verified
- [ ] POPIA compliance verified (MSISDN handling)
- [ ] Audit log retention configured (365 days)
- [ ] No plaintext secrets in repository
- [ ] No secrets in PR comments or commit messages

**Sign-off Required From**:
- [ ] Senior Engineering Lead
- [ ] Compliance Officer
- [ ] DevOps Lead

---

## Support & Contacts

- **DevOps**: devops@mentenova.co.za
- **Security**: security@mentenova.co.za
- **Doppler Support**: https://docs.doppler.com/docs/support

---

## References

- **Tippy Decision Ledger v1.0 (Final)**: § 25 — Environment, Credentials & Secrets Management (Locked)
- **Doppler Documentation**: https://docs.doppler.com
- **Doppler Dashboard**: https://dashboard.doppler.com
- **GitHub Repository**: https://github.com/francoisvandijk/tippy

---

**Last Updated**: 2025-01-27  
**Version**: 1.0  
**Status**: Active

