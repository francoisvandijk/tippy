# ⚠️ SECURITY NOTICE — Token Revocation Required

## Critical Security Action Required

The GitHub Personal Access Token used in this session was displayed in terminal output and command history.

**Action Required**: Immediately revoke and regenerate the token.

### Steps to Revoke Token

1. Go to: https://github.com/settings/tokens
2. Find the token (or revoke all tokens if unsure)
3. Click "Revoke" next to the token
4. Create a new token if needed: https://github.com/settings/tokens/new

### Steps to Regenerate Token

1. Visit: https://github.com/settings/tokens/new
2. Token name: `Tippy PR Creation` (or similar)
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
4. Click "Generate token"
5. **Copy token immediately** (you won't see it again)
6. Store securely:
   - ✅ GitHub Encrypted Secrets (for CI/CD)
   - ✅ Local `.env` file (add to `.gitignore`)
   - ✅ Password manager
   - ❌ **NEVER** in plaintext in code, config files, or terminal history

### Best Practices

Per **Tippy Decision Ledger v1.0 (Final), § 25 — Environment, Credentials & Secrets Management**:

- ✅ Use environment variables: `$env:GITHUB_TOKEN`
- ✅ Use GitHub Encrypted Secrets for CI/CD
- ✅ Use secrets managers (Azure Key Vault, AWS Secrets Manager, etc.)
- ✅ Add `.env` to `.gitignore`
- ❌ Never commit tokens to repository
- ❌ Never print tokens to console/logs
- ❌ Never store in plaintext config files

---

**Token Used**: `[REDACTED - Token has been revoked]`  
**Status**: ⚠️ **REVOKED**  
**Date**: 2025-11-10


