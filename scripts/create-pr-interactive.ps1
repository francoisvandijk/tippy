# Create Draft PR and Post § 19 Checklist Comment (Interactive)
# Tippy Release Governance Agent

$repo = "francoisvandijk/tippy"
$head = "phase-2-payments-yoco"
$base = "main"
$title = "Phase 2 - Payments & Yoco Integration - Draft for Section 19 Review"

# Check for existing token
$token = $env:GITHUB_TOKEN

if (-not $token) {
    Write-Host "GitHub Personal Access Token Required" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To create the PR automatically, you need a GitHub token with 'repo' scope." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "1. Set environment variable: `$env:GITHUB_TOKEN = 'your_token'" -ForegroundColor Gray
    Write-Host "2. Create token at: https://github.com/settings/tokens/new" -ForegroundColor Gray
    Write-Host "3. Or enter token now (will be used for this session only)" -ForegroundColor Gray
    Write-Host ""
    
    $response = Read-Host "Enter GitHub token (or 'skip' to use manual method)"
    
    if ($response -eq 'skip' -or [string]::IsNullOrWhiteSpace($response)) {
        Write-Host ""
        Write-Host "Manual PR Creation:" -ForegroundColor Yellow
        Write-Host "  URL: https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
        Write-Host "  See: docs/PR_READY_TO_CREATE.md for PR body" -ForegroundColor Gray
        Write-Host "  See: docs/CHECKLIST_COMMENT_READY_TO_POST.md for checklist" -ForegroundColor Gray
        exit 0
    }
    
    $token = $response
}

# Load PR body and checklist from files
$prBodyPath = "docs/pr-description.md"
$checklistPath = "docs/CHECKLIST_COMMENT_READY_TO_POST.md"

if (Test-Path $prBodyPath) {
    $prBody = Get-Content $prBodyPath -Raw
    # Remove the markdown header if present
    $prBody = $prBody -replace '^#.*?\n\n', ''
} else {
    Write-Host "Error: $prBodyPath not found" -ForegroundColor Red
    exit 1
}

if (Test-Path $checklistPath) {
    $checklistComment = Get-Content $checklistPath -Raw
    # Remove the markdown header if present  
    $checklistComment = $checklistComment -replace '^#.*?\n\n', ''
    # Update date placeholder
    $checklistComment = $checklistComment -replace '\[Current Date\]', (Get-Date -Format "yyyy-MM-dd")
} else {
    Write-Host "Error: $checklistPath not found" -ForegroundColor Red
    exit 1
}

# Setup API headers
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Step 1: Create Draft PR
Write-Host ""
Write-Host "Creating Draft PR..." -ForegroundColor Cyan

$prData = @{
    title = $title
    head = $head
    base = $base
    body = $prBody
    draft = $true
} | ConvertTo-Json -Depth 10

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
    } | ConvertTo-Json -Depth 10
    
    try {
        $commentResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/issues/${prNumber}/comments" `
            -Method Post `
            -Headers $headers `
            -Body $commentData `
            -ContentType "application/json"
        
        Write-Host "✅ § 19 Checklist comment posted successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host ("=" * 60) -ForegroundColor Green
        Write-Host "PR CREATED AND CHECKLIST POSTED" -ForegroundColor Green
        Write-Host ("=" * 60) -ForegroundColor Green
        Write-Host ""
        Write-Host "PR URL: $prUrl" -ForegroundColor Yellow
        Write-Host "PR Number: #${prNumber}" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Review the PR at the URL above" -ForegroundColor Gray
        Write-Host "2. Tag governance reviewers in the PR" -ForegroundColor Gray
        Write-Host "3. Announce to Ledger Governance channel" -ForegroundColor Gray
        Write-Host ""
        
        # Return PR URL
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
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fallback: Create PR manually at:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$repo/compare/$base...$head" -ForegroundColor Green
    exit 1
}

