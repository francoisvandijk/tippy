# Post Governance Comment to PR

After PR is created, run:

```powershell
gh pr comment [PR_NUMBER] --body "**§25 Review — Doppler Integration (Draft)**

- Files: \`.github/workflows/ci-doppler.yml\`, \`ops/doppler/README.md\`, \`ops/doppler/rotation_policy.json\`, \`scripts/print-env-check.js\`

- No secrets committed. CI expects \`DOPPLER_TOKEN_CI\`.

**Operator actions required:**

1) Create Doppler project/envs and CI read-only token.

2) Add token to GitHub Actions as \`DOPPLER_TOKEN_CI\`.

3) Populate required keys per env (placeholders ok for CI).

4) Re-run PR CI; expect \"Env check: PASS (values not printed)\".

**Production gate:** open \"§25: Approve Production Secrets Import\" issue and obtain Compliance sign-off before importing prod values."
```

