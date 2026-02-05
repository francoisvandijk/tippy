# Token & Secrets Audit Report

**Date:** 2025-02-05  
**Scope:** Tippy repo — tokens and secrets in use; validation status; rotation recommendations.  
**Policy:** Ledger §19.5 (Doppler CI), §25.x (token handling). No secret values are ever printed or stored in this report.

---

## 1. Inventory of Tokens/Secrets (by name only)

| Token / Env var name | Referenced in (files / workflows) | Validation method | Current status | Rotation recommendation |
|----------------------|-----------------------------------|-------------------|----------------|--------------------------|
| **DOPPLER_TOKEN_CI** | `.github/workflows/doppler-ci.yml`, `.github/workflows/token-healthcheck.yml`; docs (Ledger §25.1) | Doppler CLI `doppler run` success in CI | UNKNOWN (run healthcheck to determine) | Manual rotation per §25.1; 90-day standard, 30-day if compromised. Store new value in GitHub Actions secret only. |
| **DOPPLER_TOKEN** | Set at runtime from `DOPPLER_TOKEN_CI` in CI; `ops/doppler/*.ps1`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | Used to run Doppler CLI; validated implicitly when `doppler run` succeeds | UNKNOWN | Same as DOPPLER_TOKEN_CI when used in CI; locally use Doppler auth (keyring) or short-lived token. |
| **GITHUB_TOKEN** | `scripts/merge-and-closeout.ps1`, `scripts/create-pr-final.ps1`, `scripts/create-doppler-pr.ps1`, `scripts/create-pr.ps1`, `scripts/create-pr-and-comment.ps1`, `scripts/create-pr-interactive.ps1` | `GET https://api.github.com/rate_limit` with `Authorization: token <token>`; 200 = VALID, 401/403 = INVALID | UNKNOWN | Prefer GitHub App installation token or built-in `GITHUB_TOKEN` where possible; if PAT required, rotate manually; healthcheck will detect failure. |
| **GH_TOKEN** | `ops/dev/ensure-gh-auth.ps1`; Doppler TROUBLESHOOTING.md | Same as GITHUB_TOKEN (script uses one or the other) | UNKNOWN | Same as GITHUB_TOKEN. |
| **SENDGRID_API_KEY** | `src/lib/sms.ts`, `scripts/test-sendgrid-sms.ps1`, `.env.example`, `scripts/print-env-check.js` | `GET https://api.sendgrid.com/v3/user/account` with `Authorization: Bearer <key>`; 200 = VALID | UNKNOWN | Rotate in SendGrid dashboard; update in Doppler; healthcheck detects failure. |
| **TWILIO_ACCOUNT_SID** | `src/lib/sms.ts`, `.env.example` | With TWILIO_AUTH_TOKEN: `GET https://api.twilio.com/2010-04-01/Accounts/<sid>.json` with Basic auth; 200 = VALID | UNKNOWN | Rotate auth token in Twilio console; update Doppler; healthcheck detects failure. |
| **TWILIO_AUTH_TOKEN** | `src/lib/sms.ts`, `.env.example` | See TWILIO_ACCOUNT_SID | UNKNOWN | See TWILIO_ACCOUNT_SID. |
| **YOCO_TEST_PUBLIC_KEY** | `src/lib/yoco.ts`, `scripts/test-yoco-credentials.ps1`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | No safe read-only API; script reports UNKNOWN | UNKNOWN | Rotate in Yoco dashboard; update Doppler; no automated validation in script. |
| **YOCO_TEST_SECRET_KEY** | `src/lib/yoco.ts`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | No safe read-only API; script reports UNKNOWN | UNKNOWN | Same as YOCO_TEST_PUBLIC_KEY. |
| **YOCO_LIVE_PUBLIC_KEY** | `src/lib/yoco.ts`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | No safe read-only API; script reports UNKNOWN | UNKNOWN | Rotate in Yoco; update Doppler. |
| **YOCO_LIVE_SECRET_KEY** | `src/lib/yoco.ts`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | No safe read-only API; script reports UNKNOWN | UNKNOWN | Same as YOCO_LIVE_PUBLIC_KEY. |
| **YOCO_WEBHOOK_SECRET** | `src/lib/yoco.ts`, `src/api/routes/yoco-webhook.ts`, `scripts/add-yoco-secrets-to-doppler.ps1`, `.env.example` | Not validated by script (HMAC verification only at webhook time) | UNKNOWN | Rotate in Yoco; update Doppler. |
| **SUPABASE_JWT_SECRET** | `src/lib/auth.ts`, `.env.example`; tests set test value only | Not validated by token script (JWT verification only at runtime) | UNKNOWN | Rotate in Supabase; update Doppler. |
| **SUPABASE_DB_URL** / **DB_URL** / **TIPPY_DB_URL** | `src/lib/db.ts`, `.env.example` | Not validated by token script | UNKNOWN | Rotate DB password in Supabase; update connection strings in Doppler. |
| **SUPABASE_SERVICE_KEY** / **SUPABASE_ANON_KEY** | `src/lib/db.ts`, `.env.example` | Not validated by token script | UNKNOWN | Rotate in Supabase; update Doppler. |

---

## 2. Source mapping: ENV_VAR → Source → Used in

| ENV_VAR | Source | Used in |
|---------|--------|---------|
| DOPPLER_TOKEN_CI | GitHub Actions repository secret | `.github/workflows/doppler-ci.yml`, `.github/workflows/token-healthcheck.yml` |
| DOPPLER_TOKEN | Set in workflow from `secrets.DOPPLER_TOKEN_CI`; locally from Doppler CLI or env | All `doppler run` invocations in CI; ops/doppler scripts when run locally with token |
| GITHUB_TOKEN / GH_TOKEN | Doppler (dev config) when run via `doppler run`; or local env for scripts | PowerShell scripts: create-pr*.ps1, merge-and-closeout.ps1; ensure-gh-auth.ps1 |
| SENDGRID_API_KEY | Doppler (dev/staging/production per config) | src/lib/sms.ts; test-sendgrid-sms.ps1 |
| TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN | Doppler | src/lib/sms.ts |
| YOCO_* | Doppler | src/lib/yoco.ts, yoco-webhook route, scripts |
| SUPABASE_* | Doppler | src/lib/auth.ts, src/lib/db.ts |

---

## 3. Validation methods used

- **GitHub (GITHUB_TOKEN / GH_TOKEN):** `GET https://api.github.com/rate_limit` with `Authorization: token <token>`. VALID if 200, INVALID if 401/403.
- **Doppler:** Validated implicitly when a step runs `doppler run --project tippy --config dev -- <command>`; if the token is invalid, the step fails before the command runs.
- **SendGrid:** `GET https://api.sendgrid.com/v3/user/account` with `Authorization: Bearer <key>`. VALID if 200.
- **Twilio:** `GET https://api.twilio.com/2010-04-01/Accounts/<AccountSid>.json` with Basic auth (AccountSid:AuthToken). VALID if 200.
- **Yoco:** No documented read-only validation endpoint; script reports UNKNOWN. Manual verification or integration tests only.
- **Supabase (JWT/DB):** Not validated by the token healthcheck script.

---

## 4. Current status summary

- **VALID / INVALID:** Determined only by running the Token Healthcheck workflow (`scripts/validate_tokens.ts` + `.github/workflows/token-healthcheck.yml`). Run the workflow (manual dispatch or wait for weekly schedule) and inspect the job output and any created issue.
- **UNKNOWN:** All tokens are UNKNOWN until the healthcheck (and optional manual checks for Yoco/Supabase) have been run. The report does not contain live credentials and therefore cannot show current validity.

---

## 5. Rotation recommendations by token type

| Token type | Auto-rotation possible? | Recommendation |
|------------|--------------------------|-----------------|
| **GitHub PAT (GITHUB_TOKEN / GH_TOKEN)** | No | Prefer GitHub App installation token (short-lived, per run) or built-in `GITHUB_TOKEN` where sufficient. If PAT is required, rotate manually; healthcheck will detect expiry/revocation. |
| **DOPPLER_TOKEN_CI** | No (stored in GitHub Secrets) | Rotate per Ledger §25.1 (90-day standard). Create new service token in Doppler, update GitHub Actions secret, verify workflow. |
| **SendGrid** | Via API (if implemented) | Rotate in SendGrid; update Doppler. Optional: automation to create key and push to Doppler via Doppler API with a limited “secrets updater” token. |
| **Twilio** | Manual | Rotate auth token in Twilio console; update Doppler. Healthcheck detects failure. |
| **Yoco** | Manual | Rotate in Yoco dashboard; update Doppler. No automated validation in script; rely on manual or integration checks. |
| **Supabase** | Manual / Supabase dashboard | Rotate JWT secret and DB URL in Supabase; update Doppler. |

---

## 6. Migration plan: reduce long-lived tokens

### 6.1 GitHub PAT (GITHUB_TOKEN / GH_TOKEN)

- **Where it's used:** PowerShell scripts run manually or from automation: `merge-and-closeout.ps1`, `create-pr.ps1`, `create-pr-and-comment.ps1`, `create-pr-final.ps1`, `create-doppler-pr.ps1`, `create-pr-interactive.ps1`; `ops/dev/ensure-gh-auth.ps1`. Doppler dev config may hold a PAT for local/script use.
- **Preferred options:**
  1. **GitHub App:** For CI or automation that needs repo/workflow permissions, use a GitHub App and generate short-lived installation tokens per run. No long-lived PAT in Doppler.
  2. **Built-in GITHUB_TOKEN:** For any new or existing workflow that only needs to call the GitHub API (e.g. merge PR, create issue, comment), pass the job's `github.token` as `GITHUB_TOKEN` to the script. No PAT needed in Doppler for that workflow.
- **If a PAT must remain:** Keep it only in Doppler (or env) for *local* script runs; rotate manually; rely on Token Healthcheck to detect expiry/revocation. Document in secrets-rotation.md.

### 6.2 DOPPLER_TOKEN_CI

- Per Ledger §25.1, this stays in GitHub Actions secrets only. No auto-rotation by Doppler; rotation is manual. Healthcheck validates it implicitly when the workflow runs `doppler run`.

### 6.3 Third-party (SendGrid, Twilio, Yoco)

- No change to "Doppler holds the secret" model. Where provider APIs allow, a future "secrets updater" could rotate keys and push to Doppler via Doppler API; until then, rotation is manual and healthcheck (or manual checks for Yoco) detects failures.

---

## 7. References

- Ledger §19.5 — Doppler CI Workflow (Locked)
- Ledger §25.1 — Doppler CI Tokens (Locked)
- `scripts/validate_tokens.ts` — validation script (no secret output)
- `.github/workflows/token-healthcheck.yml` — weekly + manual healthcheck; creates/updates “Token Healthcheck Failed” issue on failure
- `docs/security/secrets-rotation.md` — rotation ownership, steps, and Doppler update process
