<#
    scripts/create-doppler-pr.ps1

    Purpose:
    - Creates a draft PR for Doppler setup via GitHub API.
    - Requires GITHUB_TOKEN environment variable.
#>
param(
    [string]$GitHubToken = $env:GITHUB_TOKEN
)

if (-not $GitHubToken) {
    Write-Error "GITHUB_TOKEN environment variable is required"
    exit 1
}

$prDescription = Get-Content "ops/doppler/PR_DESCRIPTION.md" -Raw -Encoding UTF8

$headers = @{
    "Authorization" = "token $GitHubToken"
    "Accept" = "application/vnd.github.v3+json"
}

$body = @{
    title = "Doppler Secrets Management Setup"
    body = $prDescription
    head = "infra/doppler-setup"
    base = "main"
    draft = $true
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/francoisvandijk/tippy/pulls" -Method Post -Headers $headers -Body $body
    Write-Host "PR created successfully!" -ForegroundColor Green
    Write-Host "PR URL: $($response.html_url)" -ForegroundColor Cyan
    Write-Host "PR Number: $($response.number)" -ForegroundColor Cyan
    return $response
} catch {
    Write-Error "Failed to create PR: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host "Error details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
