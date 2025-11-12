**§25 Governance Review — Doppler Setup**

- Files:  
  - `.github/workflows/ci-doppler.yml`  
  - `scripts/print-env-check.js`  
  - `ops/doppler/rotation_policy.json`  
  - `ops/doppler/README.md`  
  - `ops/doppler/bootstrap.ps1`

- Secrets: None included (verified).

- CI requires `DOPPLER_TOKEN_CI` in GitHub Actions Secrets.

**Operator Actions**

1. Run `ops/doppler/bootstrap.ps1` with your `DOPPLER_SERVICE_TOKEN_ADMIN` to create project/envs.

2. Add CI read-only token to GitHub → Settings → Secrets → Actions → **DOPPLER_TOKEN_CI**.

3. Set required keys (placeholders fine for CI).

4. Re-run CI on PR → expect "Env check: PASS (values not printed)".

5. Before importing prod secrets, open Issue **§25: Approve Production Secrets Import** and assign Compliance Officer.

**Status:** Awaiting operator bootstrap and compliance review.

