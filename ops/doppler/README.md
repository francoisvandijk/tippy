# Doppler Secrets Management Runbook (Tippy)

**Ledger Reference:** §25 — Environment, Credentials & Secrets Management (Locked)  
**Scope:** development, staging, production

## 1) Prereqs

- Doppler account with admin for project bootstrap.
- GitHub repo admin to add Actions secret.

## 2) Create Project & Environments (one-time)

Install CLI:

```bash
curl -sLf https://cli.doppler.com/install.sh | sh
doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>
```

Create project/envs (idempotent):

```bash
doppler projects create tippy || true
for env in development staging production; do
  doppler environments create $env --project tippy || true
done
```

## 3) Service Tokens (least privilege)

- CI (dev+staging read-only)
- Deploy (production only)

Create (example):

```bash
doppler service-token create --name "ci-token" --role read_only \
  --environments development,staging --project tippy
```

**Do not paste tokens into code or PRs.** Add CI token to GitHub:
Settings → Secrets and variables → Actions → **DOPPLER_TOKEN_CI**.

## 4) Required Keys (placeholders)

- `TIPPY_DB_URL`, `TIPPY_DB_PASSWORD`
- `TIPPY_YOCO_API_KEY`, `TIPPY_SENDGRID_API_KEY`, `TIPPY_TWILIO_API_KEY`
- Optional: `SENTRY_DSN`

Set keys (per env) — example:

```bash
doppler secrets set TIPPY_DB_URL="..." --project tippy --config development
```

## 5) CI Usage

The workflow `ci-doppler.yml` logs in to Doppler and runs with the `development` config.
No values are printed; `scripts/print-env-check.js` only checks presence.

## 6) Rotation & Audit

- Rotation policy: `ops/doppler/rotation_policy.json`
- Enable Doppler audit logs; export metadata-only for audits.
- Phone numbers/MSISDN: store hashed; only `last4` in reports (POPIA).

## 7) Production Gate

Create a GitHub Issue **"§25: Approve Production Secrets Import"** and assign Compliance Officer. Import to production only after approval.

## 8) Emergency

Revoke tokens in Doppler UI or via API using the token ID. Document the incident in the audit log and rotate impacted secrets.
