# 🔒 Doppler Secrets Management Setup

**Ledger Reference**: Tippy Decision Ledger v1.0 (Final), § 25 — Environment, Credentials & Secrets Management (Locked)

---

## Overview

This PR sets up Doppler for secure secrets management across all Tippy environments (development, staging, production). All runtime secrets are stored in Doppler and injected at runtime via environment variables. **No plaintext secrets are committed to this repository.**

---

## What's Included

### Infrastructure Scripts

- **`ops/doppler/setup-doppler.ps1`**: Idempotent script to create Doppler project and environments
- **`ops/doppler/create-service-tokens.ps1`**: Creates least-privilege service tokens (ci-token, deploy-token)
- **`ops/doppler/import-secrets-template.ps1`**: Secure secret import script with POPIA compliance
- **`ops/doppler/verify-access.ps1`**: Verification script for CI and runtime access

### CI/CD Integration

- **`.github/workflows/ci-doppler.yml`**: GitHub Actions workflow that:
  - Installs Doppler CLI
  - Authenticates using `DOPPLER_TOKEN_CI` secret
  - Runs tests with Doppler-injected environment variables
  - Masks secrets in CI logs

### Runtime Integration

- **`ops/doppler/docker-entrypoint.sh`**: Docker entrypoint that injects Doppler secrets
- **`ops/doppler/Dockerfile.example`**: Example Dockerfile using Doppler
- **`ops/doppler/kubernetes-secret-example.yaml`**: Kubernetes integration examples

### Documentation & Governance

- **`ops/doppler/README.md`**: Comprehensive runbook with step-by-step instructions
- **`ops/doppler/SECURE_TOKEN_REQUEST.md`**: Secure token request template
- **`ops/doppler/rotation_policy.json`**: Secret rotation policy (90 days standard, 30 days critical)
- **`ops/doppler/emergency_revoke.sh`**: Emergency token revocation script

### Secret Structure

All secrets use `TIPPY_` prefix and `snake_case` (except Yoco keys which use direct naming):
- `TIPPY_DB_URL`
- `TIPPY_DB_PASSWORD`
- `YOCO_TEST_PUBLIC_KEY` (dev/test environments)
- `YOCO_TEST_SECRET_KEY` (dev/test environments)
- `YOCO_LIVE_PUBLIC_KEY` (production)
- `YOCO_LIVE_SECRET_KEY` (production)
- `YOCO_WEBHOOK_SECRET`
- `TIPPY_SENDGRID_API_KEY`
- `TIPPY_TWILIO_API_KEY`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `SENTRY_DSN`

---

## ✅ Checklist (Human Actions Required)

### Pre-Merge

- [ ] **Obtain `DOPPLER_SERVICE_TOKEN_ADMIN`** via secure out-of-band channel (see `ops/doppler/SECURE_TOKEN_REQUEST.md`)
- [ ] **Run setup script** to create Doppler project and environments:
  ```powershell
  $env:DOPPLER_SERVICE_TOKEN_ADMIN = "[from secure channel]"
  .\ops\doppler\setup-doppler.ps1 -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN
  ```
- [ ] **Create service tokens**:
  ```powershell
  .\ops\doppler\create-service-tokens.ps1 -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN
  ```
- [ ] **Add `DOPPLER_TOKEN_CI` to GitHub repository secrets**:
  - Go to: https://github.com/francoisvandijk/tippy/settings/secrets/actions
  - Click "New repository secret"
  - Name: `DOPPLER_TOKEN_CI`
  - Value: `[paste ci-token value from step above]`
  - ⚠️ **DO NOT** add token in PR comments or commit messages
- [ ] **Import development secrets** (using `import-secrets-template.ps1`)
- [ ] **Import staging secrets** (using `import-secrets-template.ps1`)
- [ ] **Verify CI workflow** passes (push a test commit)

### Production Deployment (Requires Approval)

- [ ] **Obtain explicit approval** for production secret import (per § 25)
- [ ] **Create GitHub issue** labeled `doppler:prod-approval` and assign Compliance Officer
- [ ] **Import production secrets** (only after approval):
  ```powershell
  .\ops\doppler\import-secrets-template.ps1 `
    -DopplerAdminToken $env:DOPPLER_SERVICE_TOKEN_ADMIN `
    -Environment production
  ```
- [ ] **Store `deploy-token`** in secure deployment tooling (not in repo)
- [ ] **Verify production secrets** (no placeholders)

### Compliance & Governance

- [ ] **Verify § 25 requirements** met:
  - ✅ No plaintext secrets in repository
  - ✅ Audit logging enabled
  - ✅ Rotation policy documented
  - ✅ Least-privilege service tokens
- [ ] **Verify POPIA compliance**:
  - ✅ MSISDN hashing (SHA256) before storage
  - ✅ Only last4 digits in masked audit exports
- [ ] **Review audit logs** in Doppler dashboard
- [ ] **Document rotation schedule** (internal tracking)

---

## 🔍 Verification

### Test 1: CI Access Test

```powershell
.\ops\doppler\verify-access.ps1 `
  -DopplerToken $env:DOPPLER_SERVICE_TOKEN_ADMIN `
  -Environment development
```

**Expected**: All tests pass, secrets are masked in output

### Test 2: Runtime Consumption Test

```bash
# Using Docker
docker run -e DOPPLER_TOKEN="dp.st.xxxxx" -e DOPPLER_ENVIRONMENT="development" tippy-api

# Using Node.js directly
doppler run --doppler-config=development -- node ops/doppler/scripts/print-env-check.js
```

**Expected**: Script exits with code 0, all required env vars present

### Test 3: Audit Proof

1. Go to Doppler Dashboard: https://dashboard.doppler.com
2. Navigate to: **Workplace** → **tippy** → **Environments** → **development** → **Audit**
3. Verify recent events show:
   - Project/environment creation
   - Service token creation
   - Secret imports (metadata only, no values)

**Expected**: Audit log shows metadata-only events (no secret values)

---

## 🔒 Security & POPIA Notes

### Security

- ✅ **No secrets in this PR**: All secret values are stored in Doppler, not in repository
- ✅ **Masked outputs**: All scripts mask secrets in logs/output
- ✅ **Least privilege**: Service tokens have minimum required permissions
- ✅ **Audit logging**: All secret operations are logged (metadata only)

### POPIA Compliance

Per § 25 and POPIA requirements:

- **MSISDN Handling**: Phone numbers must be hashed (SHA256) before storage
- **Audit Exports**: Only last4 digits may be stored in masked audit exports
- **Data Minimization**: Only necessary secrets are stored
- **Access Control**: Service tokens have environment-specific access

### Audit Log Retention

- **Retention period**: 365 days (per `rotation_policy.json`)
- **Export format**: Metadata only (no secret values)
- **Access**: Available via Doppler dashboard and API (with appropriate permissions)

---

## 📋 Manual Sign-Off Required

Before merging to `main`:

**Required Sign-offs**:
- [ ] Senior Engineering Lead
- [ ] Compliance Officer
- [ ] DevOps Lead

**Verification**:
- [ ] All checklist items completed
- [ ] CI workflow passing
- [ ] Development and staging secrets imported
- [ ] Production secrets approved (if applicable)
- [ ] Audit logs reviewed
- [ ] Team trained on secret management procedures

---

## 🚨 Emergency Procedures

If a token is compromised:

1. **Identify token** (via audit logs)
2. **Run revocation script**:
   ```bash
   export DOPPLER_SERVICE_TOKEN_ADMIN="dp.st.xxxxx"
   ./ops/doppler/emergency_revoke.sh <token-id>
   ```
3. **Create replacement token**
4. **Update CI/CD or deployment tooling**
5. **Document incident**

See `ops/doppler/README.md` for detailed emergency procedures.

---

## 📚 Documentation

- **Full Runbook**: `ops/doppler/README.md`
- **Secure Token Request**: `ops/doppler/SECURE_TOKEN_REQUEST.md`
- **Rotation Policy**: `ops/doppler/rotation_policy.json`
- **Doppler Docs**: https://docs.doppler.com

---

## Next Steps

1. **Review this PR** and complete checklist items
2. **Obtain `DOPPLER_SERVICE_TOKEN_ADMIN`** via secure channel
3. **Run setup scripts** to create Doppler infrastructure
4. **Add `DOPPLER_TOKEN_CI`** to GitHub repository secrets
5. **Import secrets** for each environment
6. **Verify CI workflow** passes
7. **Obtain sign-offs** before merging

---

**Status**: ⏳ Awaiting manual actions and sign-offs  
**Blocked on**: `DOPPLER_SERVICE_TOKEN_ADMIN` token delivery via secure channel

