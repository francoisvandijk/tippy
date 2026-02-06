# Secrets Rotation

**Policy:** Ledger §19.5, §25.x. No secret values in this document or in logs.

This document covers rotation ownership, auto vs manual rotation, Doppler config for CI, required scopes, how to rotate each token, how Doppler is updated, runbooks for failure, and how the Token Healthcheck detects failures.

---

## 1. Auto-rotated vs manual secrets

| Secret | Automation | Cadence | Notes |
|--------|------------|---------|--------|
| SENDGRID_API_KEY | Auto (workflow + script) | Weekly (Sunday 07:00 UTC) | Create new key via API → write to Doppler → verify → (revoke old manually if desired) |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | Manual | Per org policy | No API to create/revoke auth token; regenerate in Twilio console, update Doppler |
| YOCO_* | Manual | Per Yoco guidance | No API rotation; rotate in Yoco dashboard, update Doppler |
| DOPPLER_TOKEN_CI | Manual | 90 days (§25.1) | GitHub Actions secret only; create new in Doppler, update repo secret |
| GITHUB_TOKEN | N/A (built-in) | Per run | Use `github.token` in CI; no rotation |
| GH_TOKEN (PAT) | Manual | If kept, per org policy | Prefer removal; store in Doppler for local use only |
| SUPABASE_* | Manual | Per Supabase / org | Rotate in Supabase, update Doppler |

---

## 2. Doppler config for CI

- **Healthcheck and rotation** use Doppler config **`ci`** so CI secrets are consistent and intentional.
- Create a **`ci`** config in the Doppler project `tippy` (e.g. duplicate from `dev`). Store CI-only secrets there (e.g. SENDGRID_API_KEY, TWILIO_*, YOCO_* for tests, DOPPLER_TOKEN_ROTATOR if using rotation).
- If **`ci`** does not exist yet, either create it in Doppler or temporarily change the workflow(s) to use config **`dev`** until `ci` is created.
- **DOPPLER_TOKEN_CI** (in GitHub Actions secrets) must have read access to the `ci` config (or `dev` if using that).

---

## 3. Required scopes

| Token / key | Scope | Where stored |
|-------------|--------|--------------|
| DOPPLER_TOKEN_CI | Doppler: read-only, project `tippy`, config `ci` (or dev) | GitHub Actions repo secret |
| DOPPLER_TOKEN_ROTATOR | Doppler: write secrets, project `tippy`, config `ci` (least privilege) | Doppler `ci` config only (not in repo) |
| SENDGRID_API_KEY | SendGrid: API Keys create + send (or full) | Doppler `ci` / `dev` |
| GITHUB_TOKEN | N/A (Actions built-in) | Injected per job |

---

## 4. Rotation ownership

| Secret / token | Owner | Rotation cadence |
|----------------|--------|-------------------|
| DOPPLER_TOKEN_CI | DevOps / platform | 90 days standard; 30 days if compromised (§25.1) |
| GITHUB_TOKEN / GH_TOKEN (PAT) | Repo admin / automation | Prefer elimination via GitHub App or GITHUB_TOKEN; if PAT required, rotate per org policy |
| SENDGRID_API_KEY | Messaging / platform | Per SendGrid best practice; rotate if compromised |
| TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN | Messaging / platform | Rotate auth token periodically; SID unchanged unless account change |
| YOCO_* (test/live keys, webhook secret) | Payments / platform | Per Yoco guidance; rotate if compromised |
| SUPABASE_* (JWT, DB URL, keys) | Backend / platform | Per Supabase project; rotate JWT/DB password on schedule or if compromised |

---

## 5. How to rotate each token

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

## 6. How Doppler gets updated

- **CI:** Only `DOPPLER_TOKEN_CI` is stored in GitHub Actions secrets. All other app secrets are fetched at runtime via `doppler run --project tippy --config ci -- <command>` (or `dev` if `ci` not used).
- **Doppler updates:** Edit secrets in the Doppler dashboard for project `tippy` and the appropriate config (`ci`, `dev`, `staging`, `production`), or use Doppler CLI with an appropriate token. The **Secrets Rotation** workflow uses `DOPPLER_TOKEN_ROTATOR` (stored in Doppler `ci` config) to write updated secrets via the Doppler API. Never commit secret values to the repo.

---

## 7. How the healthcheck detects failures

- **Workflow:** `.github/workflows/token-healthcheck.yml` runs weekly (Sunday 07:00 UTC) and on `workflow_dispatch`. It uses Doppler config **`ci`** and passes **GITHUB_TOKEN** from `github.token` so the GitHub check does not require a PAT.
- **Doppler:** The workflow passes `DOPPLER_TOKEN_CI` into the job; the “Validate Doppler token” step runs `doppler run ... echo "Doppler OK"`. If the token is invalid, that step fails.
- **App tokens:** The “Run token validation” step runs `doppler run ... npx tsx scripts/validate_tokens.ts`. The script checks:
  - **GITHUB_TOKEN** (from Actions) and optionally **GH_TOKEN** (from Doppler): `GET /rate_limit` → VALID (200) or INVALID (401/403). GH_TOKEN is optional; if missing, reported as SKIP.
  - SendGrid: `GET /v3/user/account` → VALID (200) or INVALID (non-200). SKIP if not set.
  - Twilio: `GET /Accounts/<sid>.json` with Basic auth → VALID (200) or INVALID (non-200). SKIP if not set.
  - Yoco: no API call; status UNKNOWN.
- **Output:** The script prints only token *names* and status (e.g. `GITHUB_TOKEN: VALID (200)`, `SENDGRID_API_KEY: SKIP`). It never prints secret values.
- **On failure:** If any validated token is INVALID, the workflow fails and the “Create or update Token Healthcheck Failed issue” step runs. No secrets are included in the issue.

---

## 8. Runbooks for failure

### Token Healthcheck Failed

1. Open the workflow run and read the “Run token validation” step output (token names and status only).
2. For each INVALID token: rotate or fix the credential at the provider (or in Doppler), then re-run the workflow.
3. If **GITHUB_TOKEN** is INVALID, the job is misconfigured (e.g. permissions); fix the workflow or repo settings.
4. If **Doppler** step fails, rotate or fix **DOPPLER_TOKEN_CI** in GitHub Actions secrets per §25.1.

### Secrets Rotation Failed

1. Open the workflow run and read the “Run secrets rotation” step output (secret names and status only, no values).
2. If **SENDGRID_API_KEY** failed: check SendGrid dashboard (rate limits, key permissions); ensure **DOPPLER_TOKEN_ROTATOR** in Doppler `ci` config has write access to the `tippy` project.
3. If Doppler API errors: verify **DOPPLER_TOKEN_ROTATOR** is a write-capable token for project `tippy`, config `ci`.
4. Manual secrets (Twilio, Yoco): rotate in provider dashboard and update Doppler; no automation.

---

## 9. References

- `docs/security/token-audit-report.md` — inventory, sources, validation methods, status
- `scripts/validate_tokens.ts` — validation script
- `scripts/rotate_secrets.ts` — rotation orchestrator (no secret output)
- `.github/workflows/token-healthcheck.yml` — healthcheck workflow
- `.github/workflows/secrets-rotation.yml` — secrets rotation workflow
- Ledger §19.5, §25.1, §25.2
