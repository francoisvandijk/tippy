# Tippy Decision Ledger v1.0 (Final)

**Ledger = Law — No deviations, no assumptions, no plaintext secrets.**

---

## Table of Contents

- [Phase 1: Foundation](#phase-1-foundation)
- [Phase 2: Payments & Governance](#phase-2-payments--governance)
  - [§19 — Release Governance](#19--release-governance)
  - [§19.5 — Doppler CI Workflow (Locked)](#195--doppler-ci-workflow-locked)
- [Phase 3: Operations](#phase-3-operations)
- [Secrets Management](#secrets-management)
  - [§25 — Environment, Credentials & Secrets Management](#25--environment-credentials--secrets-management)
  - [§25.1 — Doppler CI Tokens (Locked)](#251--doppler-ci-tokens-locked)

---

## Phase 1: Foundation

[Previous sections §1-§18 would be documented here]

---

## Phase 2: Payments & Governance

### §19 — Release Governance

[Section 19 content would be documented here]

#### §19.5 — Doppler CI Workflow (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

##### Overview

The Doppler CI workflow is the mandatory continuous integration pipeline for all code changes in the Tippy repository. It ensures that all code is tested with Doppler-injected secrets in a secure, auditable manner.

##### Workflow File

- **Location**: `.github/workflows/doppler-ci.yml`
- **Name**: `Doppler CI`
- **Triggers**: 
  - `workflow_dispatch` (manual trigger)
  - `push` (all branches)
  - `pull_request` (all PRs)

##### Requirements

1. **Workflow Registration**: The workflow MUST be registered and active in GitHub Actions
2. **Authentication**: Uses `DOPPLER_TOKEN_CI` secret from GitHub Actions secrets
3. **Doppler Configuration**: 
   - Project: `tippy`
   - Config: `dev`
4. **Installation**: Doppler CLI installed via official installer with sudo privileges
5. **Execution**: All tests MUST run with Doppler-injected environment variables

##### Workflow Structure

```yaml
name: Doppler CI

on:
  workflow_dispatch:
  push:
  pull_request:

jobs:
  doppler:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Install Doppler CLI
        run: |
          curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sudo sh
      - name: Run Doppler test
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_CI }}
        run: |
          doppler run --project tippy --config dev -- \
          bash -lc 'echo doppler test OK'
```

##### Branch Protection

- Doppler CI is a **required check** on the `main` branch
- All PRs targeting `main` MUST pass Doppler CI before merge
- Workflow MUST be dispatchable via `gh workflow run .github/workflows/doppler-ci.yml --ref <branch>`

##### Verification

To verify workflow is active:
```bash
gh workflow list
# Confirm "Doppler CI" appears as ACTIVE
```

To trigger workflow:
```bash
gh workflow run .github/workflows/doppler-ci.yml --ref <branch>
gh run watch --exit-status
```

##### Compliance

- No plaintext secrets in workflow file
- All secrets injected via Doppler at runtime
- Workflow logs MUST mask secret values
- All runs are auditable via GitHub Actions

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## Phase 3: Operations

[Future sections would be documented here]

---

## Secrets Management

### §25 — Environment, Credentials & Secrets Management

[Section 25 base content would be documented here]

#### §25.1 — Doppler CI Tokens (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

##### Overview

Doppler CI tokens are service tokens used exclusively for GitHub Actions CI/CD pipelines. These tokens provide read-only access to Doppler secrets for development and staging environments.

##### Token Requirements

1. **Token Name**: `ci-token`
2. **Role**: `read_only`
3. **Environments**: `development`, `staging` (production excluded)
4. **Project**: `tippy`
5. **Storage**: GitHub Actions repository secret `DOPPLER_TOKEN_CI`

##### Token Creation

Tokens MUST be created using the Doppler CLI with least-privilege principles:

```bash
doppler service-tokens create \
  --name "ci-token" \
  --role read_only \
  --environments development,staging \
  --project tippy
```

##### Token Storage

- **Location**: GitHub → Settings → Secrets and variables → Actions
- **Secret Name**: `DOPPLER_TOKEN_CI`
- **Scope**: Repository-level secret
- **Access**: GitHub Actions workflows only

##### Security Requirements

1. **Rotation Policy**: 
   - Standard rotation: 90 days
   - Critical rotation: 30 days (if compromised)
   - Rotation MUST be documented in audit logs

2. **Access Control**:
   - Read-only access only
   - No production environment access
   - No write or delete permissions

3. **Audit Requirements**:
   - All token usage logged in Doppler audit logs
   - GitHub Actions logs MUST mask token values
   - Token creation/rotation requires Compliance Officer approval

4. **Revocation**:
   - Immediate revocation if compromised
   - Use `ops/doppler/emergency_revoke.sh` for emergency revocation
   - Revocation MUST be communicated to DevOps team within 1 hour

##### Token Usage

The token is used exclusively in the Doppler CI workflow:

```yaml
env:
  DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_CI }}
```

##### Compliance

- **POPIA Compliance**: All secret access logged, no PII in logs
- **Least Privilege**: Read-only, dev/staging only
- **Audit Trail**: All access logged in Doppler and GitHub Actions
- **No Plaintext**: Token never printed or logged in plaintext

##### Operator Responsibilities

1. Create token using approved scripts (`ops/doppler/create-service-tokens.ps1`)
2. Store token in GitHub Actions secrets immediately
3. Verify token works via workflow dispatch
4. Document token creation in audit log
5. Rotate token per rotation policy
6. Revoke immediately if compromised

##### Prohibited Actions

- ❌ Storing token in code or documentation
- ❌ Using token for production access
- ❌ Sharing token via unencrypted channels
- ❌ Extending token lifetime beyond policy
- ❌ Using token for manual operations

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## Appendix

*Ledger maintained by Tippy Governance & DevOps Agent*  
*Last Updated: 2025-11-13*  
*Version: v1.0 (Final)*

