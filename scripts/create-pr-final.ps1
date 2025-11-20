<#
    scripts/create-pr-final.ps1

    Purpose:
    - Creates a draft PR for Doppler setup via GitHub API.
    - Requires GITHUB_TOKEN environment variable.
#>
$prBody = "Adds Doppler CI workflow, runbook, rotation policy, and environment verification. No secrets included. See ops/doppler/README.md for operator steps."

$headers = @{
    "Authorization" = "token $env:GITHUB_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
}

$body = @{
    title = "Doppler Secrets Management Setup - Draft (§25)"
    body = $prBody
    head = "infra/doppler-setup"
    base = "main"
    draft = $true
} | ConvertTo-Json -Depth 10

try {
    $pr = Invoke-RestMethod -Uri "https://api.github.com/repos/francoisvandijk/tippy/pulls" -Method Post -Headers $headers -Body $body
    Write-Host "PR created: $($pr.html_url)" -ForegroundColor Green
    Write-Host "PR Number: $($pr.number)" -ForegroundColor Cyan
    return $pr
} catch {
    Write-Error "Failed to create PR: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host "Error details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
