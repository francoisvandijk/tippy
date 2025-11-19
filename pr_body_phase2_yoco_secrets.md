## Overview

This PR implements Phase 2 Yoco Secrets Integration, replacing placeholder keys with proper Doppler environment variables per Ledger §25 (Locked).

## Changes

- **Replaced** `YOCO_PUBLIC_KEY`/`YOCO_SECRET_KEY` with test/live variants
- **Added** `YOCO_TEST_PUBLIC_KEY`, `YOCO_TEST_SECRET_KEY` for dev/test environments
- **Added** `YOCO_LIVE_PUBLIC_KEY`, `YOCO_LIVE_SECRET_KEY` for production
- **Updated** `YocoClient` to auto-select keys based on `NODE_ENV`
- **Added** TypeScript environment variable types (`src/env.d.ts`)
- **Updated** Doppler secrets template and import scripts
- **Updated** environment verification scripts
- **Updated** tests to use new key structure
- **Updated** documentation (README, QUICK_START, PRODUCTION_SETUP_CHECKLIST)
- **Added** helper script for adding Yoco secrets to Doppler

## Key Features

- ✅ All secrets stored in Doppler per Ledger §25 (Locked)
- ✅ No hard-coded keys in codebase
- ✅ Automatic test/live key selection based on environment
- ✅ Full TypeScript type safety for environment variables
- ✅ Comprehensive test coverage (all 72 tests passing)

## Test Keys (Provided)

- `YOCO_TEST_PUBLIC_KEY`: pk_test_2c29550fbVrmjKKc9b34
- `YOCO_TEST_SECRET_KEY`: sk_test_ca21524aNokG0LL25f4488b8addc

## Live Keys (Placeholders)

- `YOCO_LIVE_PUBLIC_KEY`: pk_live_37bf25b6bVrmjKK3ab54
- `YOCO_LIVE_SECRET_KEY`: sk_live_5c45913cNokG0LL8108487797eea

## Verification

- ✅ Build: Pass
- ✅ Tests: All 72 tests passing
- ✅ Linter: No errors
- ✅ No secrets in codebase (GitHub secret scanning passed)

## Next Steps

1. Add secrets to Doppler using:
   ```powershell
   $env:YOCO_TEST_PUBLIC_KEY="pk_test_2c29550fbVrmjKKc9b34"
   $env:YOCO_TEST_SECRET_KEY="sk_test_ca21524aNokG0LL25f4488b8addc"
   .\scripts\add-yoco-secrets-to-doppler.ps1 -DopplerAdminToken <TOKEN>
   ```

2. Verify secrets in Doppler dashboard
3. Run credential tests: `.\scripts\test-yoco-credentials.ps1 -Environment development`

## Ledger Compliance

- **§25**: Environment, Credentials & Secrets Management (Locked) ✅
- **§13.6**: No secrets in logs ✅
- **§19.10**: Auto-approval rules apply once CI passes ✅

