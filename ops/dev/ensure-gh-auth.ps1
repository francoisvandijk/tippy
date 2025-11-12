# --- ensure-gh-auth.ps1 ---
# Headless GitHub CLI authentication using Doppler-injected GH_TOKEN.
$ErrorActionPreference = "Stop"

function Test-GHAuth {
  try { gh api user -q .login | Out-Null; return $true } catch { return $false }
}

if (-not (Test-GHAuth)) {
  Write-Host "Authenticating GitHub CLI via Doppler..." -ForegroundColor Yellow
  if (-not $Env:GH_TOKEN -or $Env:GH_TOKEN.Trim() -eq "") {
    throw "GH_TOKEN missing in env. Run via 'doppler run --project tippy --config dev -- <command>'."
  }
  gh auth logout --hostname github.com -y 2>$null | Out-Null
  # Feed token on stdin to avoid echoing
  $p = Start-Process -FilePath "gh" -ArgumentList "auth login --with-token --hostname github.com" -NoNewWindow -PassThru -RedirectStandardInput "pipe"
  $p.StandardInput.WriteLine($Env:GH_TOKEN); $p.StandardInput.Close(); $p.WaitForExit()
  if ($p.ExitCode -ne 0 -or -not (Test-GHAuth)) { throw "gh auth login failed. Check PAT scopes (repo, workflow) and SSO authorization." }
}
Write-Host "GitHub authenticated as $(gh api user -q .login)" -ForegroundColor Green
