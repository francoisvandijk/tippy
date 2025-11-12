# 🔒 Secure Token Request — Doppler Service Token

**Date**: 2025-01-27  
**Requestor**: Tippy DevOps & Security Agent  
**Purpose**: Doppler setup for Tippy project secret management  
**Ledger Reference**: Tippy Decision Ledger v1.0 (Final), § 25 — Environment, Credentials & Secrets Management (Locked)

---

## ⚠️ CRITICAL: Out-of-Band Secure Channel Required

**DO NOT** provide the token via chat, email, or any unencrypted channel. Use one of the secure methods below.

---

## Required Token

**Token Name**: `DOPPLER_SERVICE_TOKEN_ADMIN`  
**Required Permissions**:
- Create projects
- Create environments
- Create service tokens
- Read/write secrets (for initial setup)
- View audit logs

**Scope**: Organization-level or project-level admin access to Doppler

---

## Secure Delivery Methods (Choose One)

### Option 1: Doppler UI (Recommended)
1. Log in to Doppler: https://dashboard.doppler.com
2. Navigate to: **Organization Settings** → **Service Tokens**
3. Create a new service token with:
   - **Name**: `tippy-setup-admin-token`
   - **Role**: `Admin` (or `Project Admin` for `tippy` project)
   - **Expiration**: Set appropriate expiration (recommend 7 days for setup, then rotate)
4. Copy the token **once** (it won't be shown again)
5. **Deliver via one of these secure channels**:
   - ✅ Password manager shared vault (1Password, Bitwarden, etc.)
   - ✅ Encrypted message (Signal, Keybase, PGP-encrypted email)
   - ✅ Secure file share with encryption (ShareFile, encrypted Google Drive link)
   - ✅ In-person or secure phone call (read token, operator types it)

### Option 2: Environment Variable (Local Setup Only)
If setting up locally and you have Doppler CLI installed:

```powershell
# Set the token in your PowerShell session (not persisted)
$env:DOPPLER_SERVICE_TOKEN_ADMIN = "dp.st.xxxxx"

# Then run the setup script
```

**⚠️ WARNING**: This method is only for local development. Never commit this to version control.

### Option 3: GitHub Encrypted Secret (For CI/CD)
If you want to use GitHub Actions for setup:

1. Go to: https://github.com/francoisvandijk/tippy/settings/secrets/actions
2. Click **New repository secret**
3. Name: `DOPPLER_SERVICE_TOKEN_ADMIN`
4. Value: `[paste token here]`
5. Click **Add secret**

**Note**: This will be used by GitHub Actions workflows, not directly by the agent.

---

## Token Usage

Once provided, the agent will use this token to:

1. ✅ Create Doppler project `tippy` (if missing)
2. ✅ Create environments: `development`, `staging`, `production`
3. ✅ Create service tokens:
   - `ci-token` (read-only, for GitHub Actions)
   - `deploy-token` (deploy role, for production deployments)
4. ✅ Set up initial secret structure (with placeholders)
5. ✅ Configure audit logging
6. ✅ Verify access and generate audit summary

**The token will NOT be**:
- ❌ Logged or printed in any output
- ❌ Committed to the repository
- ❌ Stored in plaintext files
- ❌ Shared in PR descriptions or comments

---

## Security Checklist

Before providing the token, verify:

- [ ] Token has minimum required permissions (principle of least privilege)
- [ ] Token expiration is set appropriately
- [ ] Token will be rotated after initial setup
- [ ] Delivery channel is encrypted/secure
- [ ] Token will not be shared in chat/email/PR comments

---

## After Setup

Once setup is complete:

1. **Rotate the admin token** (create a new one, revoke the old one)
2. **Store the new service tokens** (`ci-token`, `deploy-token`) securely:
   - `ci-token` → GitHub repository secret `DOPPLER_TOKEN_CI`
   - `deploy-token` → Secure deployment tooling (not in repo)

---

## Questions or Issues?

If you encounter any issues or need clarification:
- Review: Tippy Decision Ledger v1.0 (Final), § 25
- Contact: devops@mentenova.co.za
- Security concerns: security@mentenova.co.za

---

**Status**: ⏳ Awaiting secure token delivery  
**Next Step**: Once token is provided via secure channel, agent will proceed with Doppler setup

