# Secrets Rotation

**Policy:** Ledger §19.5, §25.x. No secret values in this document or in logs.

This document covers rotation ownership, how to rotate each token, how Doppler is updated, and how the Token Healthcheck detects failures.

---

## 1. Rotation ownership

| Secret / token | Owner | Rotation cadence |
|----------------|--------|-------------------|
| DOPPLER_TOKEN_CI | DevOps / platform | 90 days standard; 30 days if compromised (§25.1) |
| GITHUB_TOKEN / GH_TOKEN (PAT) | Repo admin / automation | Prefer elimination via GitHub App or GITHUB_TOKEN; if PAT required, rotate per org policy |
| SENDGRID_API_KEY | Messaging / platform | Per SendGrid best practice; rotate if compromised |
| TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN | Messaging / platform | Rotate auth token periodically; SID unchanged unless account change |
| YOCO_* (test/live keys, webhook secret) | Payments / platform | Per Yoco guidance; rotate if compromised |
| SUPABASE_* (JWT, DB URL, keys) | Backend / platform | Per Supabase project; rotate JWT/DB password on schedule or if compromised |

---

## 2. How to rotate each token

### 2.1 DOPPLER_TOKEN_CI

- Create a new Doppler service token (read_only, project `tippy`, environments `development`, `staging`) using `ops/doppler/create-service-tokens.ps1` or Doppler dashboard.
- In GitHub: **Settings → Secrets and variables → Actions** → update secret **DOPPLER_TOKEN_CI** with the new token value.
- Trigger **Doppler CI** and **Token Healthcheck** workflows to confirm.
- Revoke the old token in Doppler after confirming CI is green.

### 2.2 GitHub PAT (GITHUB_TOKEN / GH_TOKEN)

- **Preferred:** Replace usage with:
  - **GitHub App** installation token (short-lived, generated per run in CI), or
  - **Built-in GITHUB_TOKEN** where the job only needs repo-level permissions (e.g. creating issues, commenting).
- **If PAT must remain:** Create a new PAT with minimal scopes (e.g. `repo`, `workflow` as needed). Store in Doppler under the same env var name for the `dev` (and any other) config. Update any local or script usage to use Doppler-injected value. Revoke the old PAT after cutover.

### 2.3 SendGrid

- In SendGrid dashboard: create a new API key with the same permissions, then delete or deactivate the old key.
- Update Doppler: set `SENDGRID_API_KEY` for the relevant project/config (e.g. `tippy` / `dev`, `staging`, `production`) via Doppler dashboard or CLI (`doppler secrets set SENDGRID_API_KEY=<value> --project tippy --config <config>`).
- Run Token Healthcheck to confirm.

### 2.4 Twilio

- In Twilio console: regenerate the auth token (or create a new API key and use that for auth).
- Update Doppler: set `TWILIO_AUTH_TOKEN` (and any API key env var if used) for the relevant config.
- Run Token Healthcheck to confirm.

### 2.5 Yoco

- In Yoco dashboard: rotate or regenerate API keys / webhook secret as per Yoco’s process.
- Update Doppler: set `YOCO_TEST_*`, `YOCO_LIVE_*`, `YOCO_WEBHOOK_SECRET` for the relevant configs.
- No automated validation in the token script; verify via manual test or integration test.

### 2.6 Supabase

- JWT secret: rotate in Supabase project settings; update `SUPABASE_JWT_SECRET` in Doppler.
- DB URL / password: change password in Supabase; update `SUPABASE_DB_URL` / `DB_URL` / `TIPPY_DB_URL` and `TIPPY_DB_PASSWORD` in Doppler.
- Service role / anon keys: rotate in Supabase; update corresponding env vars in Doppler.

---

## 3. How Doppler gets updated

- **CI:** Only `DOPPLER_TOKEN_CI` is stored in GitHub Actions secrets. All other app secrets are fetched at runtime via `doppler run --project tippy --config <config> -- <command>`.
- **Doppler updates:** Edit secrets in the Doppler dashboard for project `tippy` and the appropriate config (`dev`, `staging`, `production`), or use Doppler CLI with an appropriate token (e.g. admin or “secrets updater” token) to run `doppler secrets set ...`. Never commit secret values to the repo.
- **Optional automation:** For providers that support key rotation via API, a follow-up could implement a small job (e.g. scheduled or manual) that creates a new key, updates Doppler via the Doppler API using a limited “secrets updater” service token, then deactivates the old key. This is not yet implemented; document here when added.

---

## 4. How the healthcheck detects failures

- **Workflow:** `.github/workflows/token-healthcheck.yml` runs on a weekly schedule (Sunday 07:00 UTC) and on `workflow_dispatch`.
- **Doppler:** The workflow passes `DOPPLER_TOKEN_CI` into the job; the “Validate Doppler token” step runs `doppler run ... echo "Doppler OK"`. If the token is invalid, that step fails.
- **App tokens:** The “Run token validation” step runs `doppler run ... npx tsx scripts/validate_tokens.ts`. The script calls:
  - GitHub: `GET /rate_limit` → VALID (200) or INVALID (401/403).
  - SendGrid: `GET /v3/user/account` → VALID (200) or INVALID (non-200).
  - Twilio: `GET /Accounts/<sid>.json` with Basic auth → VALID (200) or INVALID (non-200).
  - Yoco: no API call; status UNKNOWN (script does not fail the run for Yoco).
- **Output:** The script prints only token *names* and status (VALID / INVALID / SKIP / UNKNOWN) and, for failures, HTTP status code. It never prints secret values.
- **On failure:** If any validated token is INVALID, the workflow fails and the “Create or update Token Healthcheck Failed issue” step runs. It creates a new open issue titled **Token Healthcheck Failed** or adds a comment to an existing open issue with the same title, listing the failed token names and where they are used (file/workflow references). No secrets are included in the issue.

---

## 5. References

- `docs/security/token-audit-report.md` — inventory, sources, validation methods, status
- `scripts/validate_tokens.ts` — validation script
- `.github/workflows/token-healthcheck.yml` — healthcheck workflow
- Ledger §19.5, §25.1, §25.2
