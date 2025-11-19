# Doppler Secrets Management Runbook — Tippy (§25)

1) Install CLI & login (operator runs locally):

   curl -sLf https://cli.doppler.com/install.sh | sh
   doppler login --token <DOPPLER_SERVICE_TOKEN_ADMIN>

2) Create project/envs (idempotent):

   doppler projects create tippy || true
   for env in development staging production; do doppler environments create $env --project tippy || true; done

3) Create CI read-only token (dev+staging):

   doppler service-token create --name "ci-token" --role read_only --environments development,staging --project tippy

4) Add token to GitHub Actions:

   Settings → Secrets and variables → Actions → **DOPPLER_TOKEN_CI**

5) Required keys (placeholders per env):

   TIPPY_DB_URL, TIPPY_DB_PASSWORD, YOCO_TEST_PUBLIC_KEY, YOCO_TEST_SECRET_KEY, YOCO_LIVE_PUBLIC_KEY, YOCO_LIVE_SECRET_KEY, YOCO_WEBHOOK_SECRET, TIPPY_SENDGRID_API_KEY, TIPPY_TWILIO_API_KEY, (opt) SENTRY_DSN

6) CI uses Doppler at PR runtime; no values printed. Rotation policy in ops/doppler/rotation_policy.json. POPIA: hash MSISDN; only last4 in reports.
