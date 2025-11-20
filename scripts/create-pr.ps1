<#
    scripts/create-pr.ps1

    Purpose:
    - Creates a draft PR for Phase 2 § 19 Review.
    - Requires GITHUB_TOKEN environment variable.

    Ledger Reference: §19 (Governance & CI)
#>

$repo = "francoisvandijk/tippy"
$head = "phase-2-payments-yoco"
$base = "main"
$title = "Phase 2 - Payments & Yoco Integration - Draft for Section 19 Review"

$body = @"
# Phase 2 — Payments & Yoco Integration — Draft for § 19 Review

## Overview

This PR implements Phase 2 of the Tippy project: Payments & Yoco Integration. This draft is submitted for § 19 Review per the Tippy Decision Ledger v1.0 (Final).

## Branch Information

- **Source Branch**: `phase-2-payments-yoco`
- **Target Branch**: `main`
- **PR Type**: Draft (Governance Review)

## Implementation Status

### ⚠️ Pre-Review Findings

**Current Status**: Branch created and ready for review. Implementation files are pending.

**Missing Implementation Files**:
- `infra/db/migrations/0004_payments.sql`
- `api/routes/payments.ts`

**Action Required**: Implementation must be completed before final § 19 approval.

## Scope

### Payment Integration
- Yoco payment gateway integration
- Payment processing API endpoints
- Transaction management and logging

### Database Changes
- Payments table schema
- Migration scripts
- Index optimization

### API Endpoints
- Payment creation
- Payment retrieval
- Payment listing with filters

## Compliance & Governance

This PR adheres to:
- Tippy Decision Ledger v1.0 (Final)
- § 19 Review requirements
- Main branch protection rules
- CI/CD pipeline requirements

## Testing

- [ ] Unit tests implemented
- [ ] Integration tests implemented
- [ ] CI pipeline passing
- [ ] Manual testing completed

## Documentation

- [x] Phase 2 checklist created (`docs/phase2-checklist.md`)
- [ ] API documentation
- [ ] Database schema documentation
- [ ] Deployment guide

## Review Checklist

Please refer to the § 19 Checklist comment below for detailed review criteria.

## Next Steps

1. Complete implementation files
2. Run full test suite
3. Verify CI/CD pipeline
4. Obtain § 19 sign-offs from:
   - Senior Engineering Lead
   - Compliance Officer
   - DevOps Lead

---

**Review Status**: Draft — Awaiting § 19 Review  
**Ledger Reference**: Tippy Decision Ledger v1.0 (Final), § 19
"@

# Check for GitHub token
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "⚠️  GITHUB_TOKEN environment variable not set." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To create the PR via API, set your GitHub token:" -ForegroundColor Cyan
    Write-Host '  $env:GITHUB_TOKEN = "your_token_here"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Alternatively, create the PR manually using this link:" -ForegroundColor Cyan
    Write-Host "  https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
    Write-Host ""
    Write-Host "PR Details:" -ForegroundColor Cyan
    Write-Host "  Title: $title" -ForegroundColor Gray
    Write-Host "  Mark as: Draft" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Create PR via GitHub API
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

$prData = @{
    title = $title
    head = $head
    base = $base
    body = $body
    draft = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/pulls" `
        -Method Post `
        -Headers $headers `
        -Body $prData `
        -ContentType "application/json"
    
    Write-Host "✅ Draft PR created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "PR Number: #$($response.number)" -ForegroundColor Cyan
    Write-Host "PR URL: $($response.html_url)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Post the § 19 Checklist comment in the PR." -ForegroundColor Yellow
    Write-Host "  See: docs/section-19-checklist-comment.md" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Error creating PR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Fallback: Create PR manually at:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
    exit 1
}

