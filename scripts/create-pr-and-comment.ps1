# Create Draft PR and Post § 19 Checklist Comment
# Tippy Release Governance Agent

$repo = "francoisvandijk/tippy"
$head = "phase-2-payments-yoco"
$base = "main"
$title = "Phase 2 - Payments & Yoco Integration - Draft for Section 19 Review"

$prBody = @"
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

$checklistComment = @"
# § 19 Review Checklist — Phase 2 Payments & Yoco Integration

**Governance Agent**: Tippy Release Governance Agent  
**Review Date**: $(Get-Date -Format "yyyy-MM-dd")  
**Ledger Reference**: Tippy Decision Ledger v1.0 (Final), § 19

---

## 🔍 Pre-Review Verification

- [x] Branch: `phase-2-payments-yoco` created
- [x] Base branch: `main` verified
- [ ] Required files present (see findings below)
- [ ] CI/CD pipeline configured
- [ ] Tests passing
- [ ] Main branch protection enforced

## 📋 Required Files Verification

### Database Migration
- [ ] `infra/db/migrations/0004_payments.sql` exists and is valid
- [ ] Migration is reversible (rollback tested)
- [ ] Foreign keys and constraints defined
- [ ] Indexes optimized

### API Implementation
- [ ] `api/routes/payments.ts` exists and implements required endpoints
- [ ] Error handling implemented
- [ ] Input validation in place
- [ ] Authentication/authorization enforced

### Documentation
- [x] `docs/phase2-checklist.md` created
- [ ] API documentation complete
- [ ] Database schema documented
- [ ] Environment variables documented

## 🔒 Security & Compliance

- [ ] No hardcoded secrets or credentials
- [ ] Environment variables used for sensitive data
- [ ] API authentication implemented
- [ ] Input validation and sanitization
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] PCI compliance considerations addressed

## 🧪 Testing

- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Database migration tests passing
- [ ] Error scenarios covered
- [ ] Security test cases included
- [ ] Test coverage ≥ 80%

## 🚀 DevOps & Deployment

- [ ] CI/CD pipeline configured
- [ ] Automated tests run in CI
- [ ] Database migration strategy defined
- [ ] Rollback plan documented
- [ ] Monitoring configured
- [ ] Logging strategy implemented

## ✅ Functional Requirements

### Payment Processing
- [ ] Yoco API integration functional
- [ ] Payment creation endpoint works
- [ ] Payment retrieval endpoint works
- [ ] Payment listing with filters works
- [ ] Error responses are standardized
- [ ] Transaction logging implemented

### Database
- [ ] Payments table created correctly
- [ ] Relationships defined properly
- [ ] Data integrity maintained
- [ ] Performance optimized

## 📝 Documentation

- [ ] API endpoints documented
- [ ] Request/response examples provided
- [ ] Error codes documented
- [ ] Deployment instructions clear
- [ ] Rollback procedures documented

## 👥 Sign-Off Required

### Engineering Lead
- [ ] Code review completed
- [ ] Architecture approved
- [ ] Performance acceptable
- **Signature**: _________________ **Date**: _______

### Compliance Officer
- [ ] Security review completed
- [ ] Compliance requirements met
- [ ] Data handling approved
- **Signature**: _________________ **Date**: _______

### DevOps Lead
- [ ] CI/CD pipeline approved
- [ ] Deployment strategy approved
- [ ] Monitoring configured
- **Signature**: _________________ **Date**: _______

## 🎯 Final Decision

- [ ] **APPROVED** — Ready for merge to `main`
- [ ] **CONDITIONAL APPROVAL** — Minor issues to address (see notes)
- [ ] **REJECTED** — Major issues require rework (see notes)

### Review Notes
_Add any concerns, questions, or required actions below:_

---

**⚠️ Current Status**: Implementation files pending. Review cannot be completed until required files are added.

**Next Steps**:
1. Add missing implementation files
2. Run full test suite
3. Verify CI passes
4. Re-submit for § 19 Review

---

*This checklist is governed by Tippy Decision Ledger v1.0 (Final). Ledger = Law — no assumptions, no deviations.*
"@

# Check for GitHub token
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "⚠️  GITHUB_TOKEN environment variable not set." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To create the PR and post comment via API, set your GitHub token:" -ForegroundColor Cyan
    Write-Host '  $env:GITHUB_TOKEN = "your_token_here"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Then run this script again." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Alternatively, create the PR manually:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
    exit 1
}

# Setup API headers
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Step 1: Create Draft PR
Write-Host "Creating Draft PR..." -ForegroundColor Cyan

$prData = @{
    title = $title
    head = $head
    base = $base
    body = $prBody
    draft = $true
} | ConvertTo-Json

try {
    $prResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/pulls" `
        -Method Post `
        -Headers $headers `
        -Body $prData `
        -ContentType "application/json"
    
    $prNumber = $prResponse.number
    $prUrl = $prResponse.html_url
    
    Write-Host "✅ Draft PR created successfully!" -ForegroundColor Green
    Write-Host "   PR #${prNumber}: $prUrl" -ForegroundColor Cyan
    Write-Host ""
    
    # Step 2: Post § 19 Checklist Comment
    Write-Host "Posting § 19 Checklist comment..." -ForegroundColor Cyan
    
    $commentData = @{
        body = $checklistComment
    } | ConvertTo-Json
    
    try {
        $commentResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/issues/${prNumber}/comments" `
            -Method Post `
            -Headers $headers `
            -Body $commentData `
            -ContentType "application/json"
        
        Write-Host "✅ § 19 Checklist comment posted successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "=" * 60 -ForegroundColor Green
        Write-Host "PR CREATED AND CHECKLIST POSTED" -ForegroundColor Green
        Write-Host "=" * 60 -ForegroundColor Green
        Write-Host ""
        Write-Host "PR URL: $prUrl" -ForegroundColor Yellow
        Write-Host "PR Number: #${prNumber}" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Review the PR at the URL above" -ForegroundColor Gray
        Write-Host "2. Tag governance reviewers in the PR" -ForegroundColor Gray
        Write-Host "3. Announce to Ledger Governance channel" -ForegroundColor Gray
        
        # Return PR URL for reporting
        return $prUrl
        
    } catch {
        Write-Host "❌ Error posting checklist comment:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Host ""
        Write-Host "⚠️  PR was created but comment failed. Manual action required." -ForegroundColor Yellow
        Write-Host "   PR URL: $prUrl" -ForegroundColor Cyan
        Write-Host "   Post checklist manually from: docs/CHECKLIST_COMMENT_READY_TO_POST.md" -ForegroundColor Gray
        return $prUrl
    }
    
} catch {
    Write-Host "❌ Error creating PR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Fallback: Create PR manually at:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
    exit 1
}

