# AI Auto-Approval & Auto-Merge Agent Specification

**Reference:** §19.10 — AI Auto-Approval & Auto-Merge Exception (Locked) in `docs/TIPPY_DECISION_LEDGER.md`

This document provides an operational checklist for AI agents implementing §19.10. It must remain in sync with the Ledger and does not override it.

---

## When AI May Auto-Approve a PR

An AI agent may approve a PR **only if ALL** of the following conditions are met:

### 1. Repository & Branch Scope
- ✅ Repository: `francoisvandijk/tippy`
- ✅ Base branch: `main`
- ✅ Head branch starts with: `feature/`, `fix/`, `chore/`, or `refactor/`

### 2. File Path Scope (Allowed)
- ✅ All modified files are limited to:
  - `src/**`
  - `tests/**`
  - `infra/db/migrations/**`
  - `docs/**` (implementation docs only)
  - `.github/workflows/**` (only non-secret env names, step names, matrix/cache settings, comments)

### 3. File Path Scope (Forbidden)
- ❌ PR **must NOT** modify:
  - `docs/TIPPY_DECISION_LEDGER.md`
  - Any file marked **(Locked)** that is purely governance
  - `ops/doppler/**`
  - `.github/workflows/doppler-ci.yml`
  - `docs/PHASE_*_GOVERNANCE_CLOSE_OUT.md`
  - Any file tagged "Governance – Human Review Required"

### 4. Local Technical Checks (Must Pass)
- ✅ `npm run build` exits with code `0`
- ✅ `npm test` exits with code `0` (no failing tests, no suite errors)
- ✅ If migrations touched: migration runner succeeds against test DB (no relation errors, no RLS failures)
- ✅ If available: `npm run lint` passes
- ✅ If available: `npm run typecheck` passes
- ✅ Grep scan confirms: no hard-coded secrets, no raw MSISDN/PII in logs

### 5. CI Preconditions (GitHub / Doppler)
- ✅ All required status checks show **SUCCESS** (including Doppler CI per §19.5)
- ✅ No pending or failed required checks
- ✅ GitHub reports merge state as **CLEAN** (no conflicts)

### 6. Audit Logging
- ✅ Audit entry can be written to `ops/doppler/AUDIT_LOG.txt` (or Ledger-approved audit file per §25)

### 7. Human Override Check
- ✅ No `no-auto-merge` label present on PR

---

## When AI May Auto-Merge a PR

An AI agent may auto-merge a PR **only if**:

1. ✅ All conditions for auto-approval are satisfied (above); **and**
2. ✅ Branch protection confirms all required checks passing and PR is mergeable

**Merge Method:** Squash merge into `main`

**Post-Merge:** Optionally delete head branch if:
- Branch name prefixed `feature/`, `fix/`, `chore/`, or `refactor/`; and
- No `keep-branch` label or note present

**If merge fails:** Do NOT retry. Leave comment and require human intervention.

---

## Required Actions Before Auto-Approval

1. **Run Local Checks:**
   ```bash
   npm run build
   npm test
   # If migrations touched:
   npm run migrate  # or equivalent
   # If available:
   npm run lint
   npm run typecheck
   ```

2. **Verify File Scope:**
   - Check all modified files against allowed/forbidden lists
   - Confirm no governance/locked files touched

3. **Check for Secrets/PII:**
   ```bash
   # Scan diff for hard-coded secrets
   git diff main...HEAD | grep -iE "(api_key|password|token|secret)" | grep -v "process.env"
   # Scan for raw MSISDN logging
   git diff main...HEAD | grep -iE "(console\.(log|error).*msisdn|log.*\+.*msisdn)"
   ```

4. **Verify CI Status:**
   ```bash
   gh pr view --json statusCheckRollup,mergeable
   # Or use GitHub API
   ```

5. **Write Audit Entry:**
   - Format: UTC timestamp, PR number/title, branch/SHA, scope summary, result (`AI_APPROVED_ONLY` or `AI_APPROVED_AND_MERGED`), CI context, confirmation note
   - Location: `ops/doppler/AUDIT_LOG.txt` or Ledger-approved audit file

---

## Required Actions for Auto-Approval Review

Submit PR review with:
- **State:** `APPROVE`
- **Body must include:**
  - Summary of changes
  - Confirmation that `npm run build` and `npm test` passed locally
  - Confirmation that migrations (if present) ran successfully
  - Confirmation that no governance/locked files were modified
  - Confirmation that all required CI checks are green

---

## Required Actions if Preconditions Fail

If **any** precondition is not met:

- ❌ **DO NOT** approve the PR
- ✅ Add a **COMMENT** explaining:
  - Which conditions failed
  - That human review is required
  - What needs to be fixed

---

## Audit Entry Format

Each audit entry must include:

```
[UTC_TIMESTAMP] PR #N: [Title]
  Branch: [branch_name] @ [commit_sha]
  Scope: [one-line summary]
  Result: [AI_APPROVED_ONLY | AI_APPROVED_AND_MERGED]
  CI: [Doppler CI run ID / overall status]
  Note: §19.10 preconditions satisfied
```

---

## Important Notes

- **Any failure** in the checklist = no auto-approval/merge, comment only
- This spec does not override the Ledger (§19.10)
- If Ledger and this spec conflict, the Ledger takes precedence
- AI agents must verify all conditions programmatically before acting
- When in doubt, require human review

---

**Last Updated:** 2025-01-XX (sync with Ledger §19.10)

